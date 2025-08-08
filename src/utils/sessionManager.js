import { BufferJSON } from '@whiskeysockets/baileys';
import { logger } from './logger.js';
import { File } from 'megajs';
import fs from 'fs';
import path from 'path';

/**
 * Convert session string to Baileys auth state
 * Supports multiple formats:
 * 1. Direct session strings: "prefix~base64data"
 * 2. Mega.nz identifiers: "prefix~fileId#decryptionKey"
 * 3. Direct JSON strings
 */
export async function sessionStringToAuth(sessionString) {
    try {
        if (!sessionString || sessionString === 'your-session-string-here') {
            throw new Error('Invalid session string');
        }

        // Check if it's a Mega.nz identifier format - IMPROVED LOGIC
        // Must have both ~ and #, and the part after ~ should contain #
        if (sessionString.includes('~')) {
            const parts = sessionString.split('~');
            if (parts.length === 2 && parts[1].includes('#')) {
                logger.info('🔗 Detected Mega.nz session format');
                return await handleMegaSession(sessionString);
            }
        }

        // Handle traditional session string formats
        return await handleDirectSession(sessionString);

    } catch (error) {
        logger.error('Failed to convert session string to auth state:', error.message);
        throw new Error(`Session string conversion failed: ${error.message}`);
    }
}

/**
 * Handle Mega.nz session format: "prefix~fileId#decryptionKey"
 */
async function handleMegaSession(sessionString) {
    try {
        const parts = sessionString.split('~');
        if (parts.length !== 2) {
            throw new Error('Invalid Mega session format. Expected: "prefix~fileId#key"');
        }

        const [prefix, megaData] = parts;
        const [fileId, decryptionKey] = megaData.split('#');

        if (!fileId || !decryptionKey) {
            throw new Error('Invalid Mega format. Expected: fileId#decryptionKey');
        }

        logger.info(`📥 Processing Mega.nz session:`);
        logger.info(`   Prefix: ${prefix}`);
        logger.info(`   File ID: ${fileId}`);
        logger.info(`   Key length: ${decryptionKey.length} characters`);

        // Check cache first
        const cached = await loadCachedSession(prefix);
        if (cached) {
            logger.info('📦 Using cached Mega.nz session');
            return {
                state: {
                    creds: cached.creds,
                    keys: cached.keys || {}
                }
            };
        }

        // Construct Mega.nz URL
        const megaUrl = `https://mega.nz/file/${fileId}#${decryptionKey}`;
        logger.info(`🔗 Mega URL: ${megaUrl}`);
        
        // Download from Mega
        logger.info('⏳ Downloading WhatsApp session file from Mega.nz...');
        const sessionData = await downloadFromMega(megaUrl);
        
        // Cache the session locally for faster future access
        await cacheSession(sessionData, prefix);
        
        logger.info('✅ Mega.nz session processed successfully');
        return {
            state: {
                creds: sessionData.creds,
                keys: sessionData.keys || {}
            }
        };

    } catch (error) {
        logger.error('Failed to handle Mega session:', error.message);
        
        // Add specific guidance for Mega.nz issues
        if (error.message.includes('File not found')) {
            logger.error('💡 Troubleshooting tips:');
            logger.error('   • Check if the Mega.nz file still exists');
            logger.error('   • Verify the file ID and decryption key are correct');
            logger.error('   • Generate a new session if the file was deleted');
        } else if (error.message.includes('Network')) {
            logger.error('💡 Network troubleshooting:');
            logger.error('   • Check your internet connection');
            logger.error('   • Verify your server can access mega.nz');
            logger.error('   • Try again in a few minutes');
        }
        
        throw error;
    }
}

/**
 * Handle direct session string format: "prefix~base64data"
 */
async function handleDirectSession(sessionString) {
    try {
        let sessionData;
        
        if (sessionString.includes('~')) {
            // Format: "malvin~base64data"
            const parts = sessionString.split('~');
            if (parts.length !== 2) {
                throw new Error('Invalid session string format. Expected format: "prefix~data"');
            }
            
            const [prefix, data] = parts;
            logger.debug(`Session prefix: ${prefix}`);
            
            try {
                // Try to decode as base64
                const decoded = Buffer.from(data, 'base64').toString();
                sessionData = JSON.parse(decoded, BufferJSON.reviver);
            } catch (decodeError) {
                // If base64 decode fails, try direct JSON parse
                sessionData = JSON.parse(data, BufferJSON.reviver);
            }
        } else {
            // Direct JSON string or base64 encoded JSON
            try {
                sessionData = JSON.parse(sessionString, BufferJSON.reviver);
            } catch (directJsonError) {
                const decoded = Buffer.from(sessionString, 'base64').toString();
                sessionData = JSON.parse(decoded, BufferJSON.reviver);
            }
        }

        // Validate session data structure
        if (!sessionData || typeof sessionData !== 'object') {
            throw new Error('Session data is not a valid object');
        }

        // Check for required fields
        if (!sessionData.creds) {
            throw new Error('Missing required field in session data: creds');
        }

        // Ensure keys object exists
        if (!sessionData.keys) {
            sessionData.keys = {};
        }

        logger.debug('Session data structure validated');
        
        return {
            state: {
                creds: sessionData.creds,
                keys: sessionData.keys || {}
            }
        };

    } catch (error) {
        throw new Error(`Direct session parsing failed: ${error.message}`);
    }
}

/**
 * Download session data from Mega.nz
 */
async function downloadFromMega(megaUrl) {
    try {
        logger.info('⬇️ Connecting to Mega.nz...');
        logger.info(`📡 URL: ${megaUrl}`);
        
        // Create file instance from URL
        const file = File.fromURL(megaUrl);
        
        // Download the file buffer
        logger.info('📦 Downloading session file...');
        const buffer = await file.downloadBuffer();
        
        logger.info(`✅ Downloaded ${buffer.length} bytes from Mega.nz`);
        
        // Convert buffer to string
        const jsonString = buffer.toString('utf-8');
        logger.debug(`📄 File content preview: ${jsonString.substring(0, 100)}...`);
        
        // Try to parse as JSON with BufferJSON.reviver for Baileys compatibility
        let rawData;
        try {
            rawData = JSON.parse(jsonString, BufferJSON.reviver);
        } catch (parseError) {
            logger.error('❌ JSON parsing failed:', parseError.message);
            logger.debug('Raw content:', jsonString.substring(0, 500));
            throw new Error('Downloaded file is not valid JSON format');
        }
        
        // Check if data is valid
        if (!rawData || typeof rawData !== 'object') {
            throw new Error('Downloaded file does not contain valid session object');
        }
        
        let sessionData;
        
        // Check if the data is already in the expected format (nested under 'creds')
        if (rawData.creds && typeof rawData.creds === 'object') {
            logger.info('📋 Found nested session format (creds object exists)');
            sessionData = rawData;
        } else {
            // Handle flat format - wrap everything in 'creds' object
            logger.info('📋 Converting flat session format to nested format');
            
            // Check for essential WhatsApp session fields at root level
            const essentialFields = ['noiseKey', 'signedIdentityKey', 'registrationId'];
            const hasEssentials = essentialFields.some(field => rawData[field]);
            
            if (!hasEssentials) {
                logger.error('❌ Session validation failed - missing essential WhatsApp fields');
                logger.debug('Available top-level keys:', Object.keys(rawData));
                throw new Error('Downloaded file does not contain valid WhatsApp session data');
            }
            
            // Create nested structure
            sessionData = {
                creds: rawData,
                keys: {} // Initialize empty keys object
            };
            
            logger.info('✅ Successfully converted flat format to nested format');
        }
        
        // Validate the final session data structure
        if (!sessionData.creds) {
            throw new Error('Session data missing creds object after processing');
        }
        
        // Check for required creds fields
        const requiredFields = ['noiseKey', 'signedIdentityKey', 'registrationId'];
        const missingFields = requiredFields.filter(field => !sessionData.creds[field]);
        
        if (missingFields.length > 0) {
            logger.warn(`⚠️ Session missing some fields: ${missingFields.join(', ')}`);
        } else {
            logger.info('✅ All essential session fields present');
        }
        
        // Ensure keys object exists
        if (!sessionData.keys) {
            logger.info('📝 Initializing empty keys object');
            sessionData.keys = {};
        }
        
        // Log session info
        const phoneNumber = sessionData.creds.me?.id?.split(':')[0] || 'Unknown';
        const registered = sessionData.creds.registered;
        const keyCount = Object.keys(sessionData.keys).length;
        
        logger.info('✅ Session data processed successfully');
        logger.info(`📊 Session info: Phone: ${phoneNumber}, Registered: ${registered}, Keys: ${keyCount}`);
        
        return sessionData;
        
    } catch (error) {
        logger.error('❌ Mega.nz download failed:', error.message);
        
        // Provide helpful error messages based on error type
        if (error.message.includes('ENOTFOUND') || error.message.includes('network') || error.message.includes('getaddrinfo')) {
            throw new Error('Network error: Could not connect to Mega.nz. Check your internet connection.');
        } else if (error.message.includes('404') || error.message.includes('not found') || error.message.includes('File not found')) {
            throw new Error('File not found: The Mega.nz file may have been deleted or the link is invalid.');
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
            throw new Error('Access denied: The Mega.nz file may be private or the key is incorrect.');
        } else if (error.message.includes('JSON') || error.message.includes('parse')) {
            throw new Error('Invalid session file: The downloaded file is not valid JSON session data.');
        } else if (error.message.includes('credentials') || error.message.includes('creds')) {
            throw new Error('Invalid session structure: The file does not contain valid WhatsApp credentials.');
        } else if (error.message.includes('timeout')) {
            throw new Error('Download timeout: Mega.nz is taking too long to respond. Try again later.');
        }
        
        throw new Error(`Mega.nz download failed: ${error.message}`);
    }
}

/**
 * Cache session data locally for faster access
 */
async function cacheSession(sessionData, prefix) {
    try {
        const cacheDir = './sessions/cache';
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        
        const cacheFile = path.join(cacheDir, `${prefix}_cached.json`);
        fs.writeFileSync(cacheFile, JSON.stringify(sessionData, BufferJSON.replacer, 2));
        
        logger.debug(`💾 Session cached to: ${cacheFile}`);
        
    } catch (error) {
        logger.debug('Could not cache session:', error.message);
        // Don't throw - caching is optional
    }
}

/**
 * Try to load cached session
 */
async function loadCachedSession(prefix) {
    try {
        const cacheFile = path.join('./sessions/cache', `${prefix}_cached.json`);
        
        if (!fs.existsSync(cacheFile)) {
            return null;
        }
        
        // Check if cache is recent (less than 1 hour old)
        const stats = fs.statSync(cacheFile);
        const hourAgo = Date.now() - (60 * 60 * 1000);
        
        if (stats.mtime.getTime() < hourAgo) {
            logger.debug('Cached session expired, will download fresh copy');
            return null;
        }
        
        const cachedData = fs.readFileSync(cacheFile, 'utf-8');
        const sessionData = JSON.parse(cachedData, BufferJSON.reviver);
        
        logger.info('✅ Using cached session data');
        return sessionData;
        
    } catch (error) {
        logger.debug('Could not load cached session:', error.message);
        return null;
    }
}

/**
 * Convert Baileys auth state to session string
 */
export function authToSessionString(authState, prefix = 'groq') {
    try {
        const sessionData = {
            creds: authState.creds,
            keys: authState.keys || {}
        };

        const jsonString = JSON.stringify(sessionData, BufferJSON.replacer);
        const base64Data = Buffer.from(jsonString).toString('base64');
        
        return `${prefix}~${base64Data}`;

    } catch (error) {
        logger.error('Failed to convert auth state to session string:', error.message);
        throw new Error(`Auth state conversion failed: ${error.message}`);
    }
}

/**
 * Validate session string format - IMPROVED LOGIC
 */
export function validateSessionString(sessionString) {
    try {
        if (!sessionString || typeof sessionString !== 'string') {
            return { valid: false, error: 'Session string is empty or not a string' };
        }

        if (sessionString === 'your-session-string-here') {
            return { valid: false, error: 'Please replace placeholder with actual session string' };
        }

        if (sessionString.length < 10) {
            return { valid: false, error: 'Session string too short' };
        }

        // IMPROVED: Check for Mega.nz format - must have ~ and the part after ~ must contain #
        if (sessionString.includes('~')) {
            const parts = sessionString.split('~');
            if (parts.length === 2 && parts[1].includes('#')) {
                // This is Mega.nz format: prefix~fileId#key
                const [prefix, megaData] = parts;
                const megaParts = megaData.split('#');
                if (megaParts.length === 2 && megaParts[0] && megaParts[1]) {
                    return { valid: true, type: 'mega', prefix };
                }
                return { valid: false, error: 'Invalid Mega format. Expected: prefix~fileId#key' };
            } else if (parts.length === 2) {
                // Direct session string format: prefix~base64data
                return { valid: true, type: 'direct' };
            } else {
                return { valid: false, error: 'Invalid session string format' };
            }
        } else {
            // Raw JSON format (no prefix)
            return { valid: true, type: 'json' };
        }

    } catch (error) {
        return { valid: false, error: 'Validation error: ' + error.message };
    }
}

/**
 * Extract session info from session string - FIXED: Added async
 */
export async function getSessionInfo(sessionString) {
    try {
        const validation = validateSessionString(sessionString);
        
        if (!validation.valid) {
            return {
                hasCredentials: false,
                hasKeys: false,
                registered: false,
                phoneNumber: 'Invalid session',
                type: 'invalid'
            };
        }

        // For Mega sessions, we can't extract info without downloading
        if (validation.type === 'mega') {
            return {
                hasCredentials: true,
                hasKeys: true,
                registered: 'unknown',
                phoneNumber: 'Mega.nz session',
                type: 'mega',
                prefix: validation.prefix
            };
        }

        // For direct sessions, try to extract info
        try {
            const authState = await sessionStringToAuth(sessionString);
            
            return {
                hasCredentials: !!authState.state.creds,
                hasKeys: !!authState.state.keys && Object.keys(authState.state.keys).length > 0,
                registered: !!authState.state.creds?.registered,
                phoneNumber: authState.state.creds?.me?.id?.split(':')[0] || 'Unknown',
                type: validation.type
            };
        } catch (error) {
            return {
                hasCredentials: false,
                hasKeys: false,
                registered: false,
                phoneNumber: 'Parse error',
                type: validation.type
            };
        }

    } catch (error) {
        logger.debug('Could not extract session info:', error.message);
        return {
            hasCredentials: false,
            hasKeys: false,
            registered: false,
            phoneNumber: 'Invalid session',
            type: 'error'
        };
    }
}

/**
 * Clean up and normalize session string
 */
export function normalizeSessionString(sessionString) {
    if (!sessionString) return '';
    
    // Remove whitespace
    sessionString = sessionString.trim();
    
    // Remove quotes if wrapped
    if ((sessionString.startsWith('"') && sessionString.endsWith('"')) ||
        (sessionString.startsWith("'") && sessionString.endsWith("'"))) {
        sessionString = sessionString.slice(1, -1);
    }
    
    return sessionString;
}

/**
 * Test session connectivity (for debugging)
 */
export async function testSession(sessionString) {
    try {
        logger.info('🧪 Testing session connectivity...');
        
        const validation = validateSessionString(sessionString);
        logger.info(`📝 Session validation: ${validation.valid ? '✅ Valid' : '❌ Invalid'} (Type: ${validation.type})`);
        
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }
        
        if (validation.type === 'mega') {
            logger.info('🔗 Testing Mega.nz download...');
            const authState = await sessionStringToAuth(sessionString);
            logger.info('✅ Mega.nz session download successful');
            
            return {
                success: true,
                type: 'mega',
                hasCredentials: !!authState.state.creds,
                phoneNumber: authState.state.creds?.me?.id?.split(':')[0] || 'Unknown'
            };
        } else {
            const authState = await sessionStringToAuth(sessionString);
            logger.info('✅ Direct session parsing successful');
            
            return {
                success: true,
                type: validation.type,
                hasCredentials: !!authState.state.creds,
                phoneNumber: authState.state.creds?.me?.id?.split(':')[0] || 'Unknown'
            };
        }
        
    } catch (error) {
        logger.error('❌ Session test failed:', error.message);
        return { success: false, error: error.message };
    }
}
