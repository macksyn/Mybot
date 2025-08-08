import { BufferJSON } from '@whiskeysockets/baileys';
import { logger } from './logger.js';
import { File } from 'megajs';
import fs from 'fs';
import path from 'path';

/**
 * Enhanced session manager with better flat format handling
 */

/**
 * Download session data from Mega.nz with enhanced format detection
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
        
        logger.info('📋 Analyzing session structure...');
        
        let sessionData;
        
        // ENHANCED: Check if the data is already in the expected nested format
        if (rawData.creds && typeof rawData.creds === 'object') {
            logger.info('✅ Found nested session format (creds object exists)');
            sessionData = rawData;
            
            // Validate nested format
            const requiredFields = ['noiseKey', 'signedIdentityKey', 'registrationId'];
            const missingFields = requiredFields.filter(field => !sessionData.creds[field]);
            
            if (missingFields.length > 0) {
                logger.warn(`⚠️ Nested format missing some fields: ${missingFields.join(', ')}`);
            } else {
                logger.info('✅ All essential nested format fields present');
            }
            
        } else {
            // ENHANCED: Handle flat format with better field detection
            logger.info('🔍 Checking for flat session format...');
            
            // Check for essential WhatsApp session fields at root level
            const essentialFields = [
                'noiseKey', 'signedIdentityKey', 'registrationId',
                'advSecretKey', 'nextPreKeyId', 'firstUnuploadedPreKeyId'
            ];
            
            const foundEssentials = essentialFields.filter(field => 
                rawData[field] !== undefined && rawData[field] !== null
            );
            
            logger.info(`🔑 Found ${foundEssentials.length}/${essentialFields.length} essential fields at root level`);
            logger.debug(`Found fields: ${foundEssentials.join(', ')}`);
            
            // Check for minimum required fields
            const minimumRequired = ['noiseKey', 'signedIdentityKey', 'registrationId'];
            const hasMinimum = minimumRequired.every(field => rawData[field] !== undefined);
            
            if (hasMinimum) {
                logger.info('✅ Found flat session format with minimum required fields');
                logger.info('🔄 Converting flat format to nested format...');
                
                // Create nested structure by wrapping everything in 'creds'
                sessionData = {
                    creds: { ...rawData }, // Copy all root-level data to creds
                    keys: {} // Initialize empty keys object
                };
                
                // Validate conversion
                const postConversionMissing = minimumRequired.filter(field => !sessionData.creds[field]);
                
                if (postConversionMissing.length === 0) {
                    logger.info('✅ Successfully converted flat format to nested format');
                    logger.info(`📊 Converted session: ${Object.keys(sessionData.creds).length} credential fields`);
                } else {
                    throw new Error(`Conversion failed: still missing ${postConversionMissing.join(', ')}`);
                }
                
            } else {
                logger.error('❌ Session validation failed - missing essential WhatsApp fields');
                logger.debug(`Available top-level keys: ${Object.keys(rawData).join(', ')}`);
                logger.debug(`Missing required fields: ${minimumRequired.filter(f => !rawData[f]).join(', ')}`);
                
                // Try to identify what type of file this might be
                const topKeys = Object.keys(rawData).slice(0, 10);
                logger.debug(`Top-level structure preview: ${topKeys.join(', ')}`);
                
                if (rawData.contacts || rawData.chats) {
                    throw new Error('File appears to be a chat backup, not session credentials');
                } else if (rawData.version || rawData.type) {
                    throw new Error('File appears to be a different type of WhatsApp data, not session credentials');
                } else {
                    throw new Error('File does not contain valid WhatsApp session credentials');
                }
            }
        }
        
        // Final validation of the session structure
        if (!sessionData.creds) {
            throw new Error('Session data missing creds object after processing');
        }
        
        // Ensure keys object exists
        if (!sessionData.keys) {
            logger.info('📝 Initializing empty keys object');
            sessionData.keys = {};
        }
        
        // Enhanced session info logging
        const phoneNumber = sessionData.creds.me?.id?.split(':')[0] || 'Unknown';
        const registered = sessionData.creds.registered;
        const keyCount = Object.keys(sessionData.keys).length;
        const advSecretKey = !!sessionData.creds.advSecretKey;
        const registrationId = sessionData.creds.registrationId;
        
        logger.info('✅ Session data processed successfully');
        logger.info(`📊 Session details:`);
        logger.info(`   📞 Phone: ${phoneNumber}`);
        logger.info(`   📋 Registered: ${registered}`);
        logger.info(`   🔑 Keys: ${keyCount}`);
        logger.info(`   🆔 Registration ID: ${registrationId}`);
        logger.info(`   🔐 Advanced Security: ${advSecretKey ? 'Yes' : 'No'}`);
        
        // Additional validation for common issues
        if (!sessionData.creds.noiseKey) {
            logger.warn('⚠️ Missing noiseKey - authentication may fail');
        }
        
        if (!sessionData.creds.signedIdentityKey) {
            logger.warn('⚠️ Missing signedIdentityKey - authentication may fail');
        }
        
        if (typeof sessionData.creds.registrationId !== 'number') {
            logger.warn('⚠️ registrationId is not a number - may cause issues');
        }
        
        return sessionData;
        
    } catch (error) {
        logger.error('❌ Mega.nz download failed:', error.message);
        
        // Enhanced error messages with specific guidance
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
        } else if (error.message.includes('chat backup') || error.message.includes('different type')) {
            throw new Error(`Wrong file type: ${error.message}`);
        }
        
        throw new Error(`Mega.nz download failed: ${error.message}`);
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
        
        // Download from Mega using enhanced downloader
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
        
        // Add specific guidance for common Mega.nz issues
        if (error.message.includes('File not found')) {
            logger.error('💡 Mega.nz troubleshooting tips:');
            logger.error('   • Check if the Mega.nz file still exists');
            logger.error('   • Verify the file ID and decryption key are correct');
            logger.error('   • Generate a new session if the file was deleted');
            logger.error('   • Try visiting the Mega URL in your browser first');
        } else if (error.message.includes('Network')) {
            logger.error('💡 Network troubleshooting:');
            logger.error('   • Check your internet connection');
            logger.error('   • Verify your server can access mega.nz');
            logger.error('   • Try again in a few minutes');
            logger.error('   • Check if mega.nz is blocked in your region');
        } else if (error.message.includes('Wrong file type')) {
            logger.error('💡 File type troubleshooting:');
            logger.error('   • Make sure you\'re using session credentials, not chat backups');
            logger.error('   • Verify your session generator is working correctly');
            logger.error('   • Try generating a fresh session');
        }
        
        throw error;
    }
}

/**
 * Convert session string to Baileys auth state - Enhanced version
 */
export async function sessionStringToAuth(sessionString) {
    try {
        if (!sessionString || sessionString === 'your-session-string-here') {
            throw new Error('Invalid session string');
        }

        // Check if it's a Mega.nz identifier format
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

        // Apply the same enhanced format detection as Mega sessions
        if (!sessionData || typeof sessionData !== 'object') {
            throw new Error('Session data is not a valid object');
        }

        // Check for nested format first
        if (sessionData.creds && typeof sessionData.creds === 'object') {
            logger.debug('Found nested session format in direct session');
        } else {
            // Check for flat format
            const essentialFields = ['noiseKey', 'signedIdentityKey', 'registrationId'];
            const hasEssentials = essentialFields.every(field => sessionData[field] !== undefined);
            
            if (hasEssentials) {
                logger.debug('Converting flat format direct session to nested format');
                sessionData = {
                    creds: sessionData,
                    keys: {}
                };
            } else {
                throw new Error('Missing required fields in session data');
            }
        }

        // Ensure keys object exists
        if (!sessionData.keys) {
            sessionData.keys = {};
        }

        logger.debug('Direct session data structure validated');
        
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
 * Rest of the session manager functions remain the same...
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

        // Check for Mega.nz format
        if (sessionString.includes('~')) {
            const parts = sessionString.split('~');
            if (parts.length === 2 && parts[1].includes('#')) {
                const [prefix, megaData] = parts;
                const megaParts = megaData.split('#');
                if (megaParts.length === 2 && megaParts[0] && megaParts[1]) {
                    return { valid: true, type: 'mega', prefix };
                }
                return { valid: false, error: 'Invalid Mega format. Expected: prefix~fileId#key' };
            } else if (parts.length === 2) {
                return { valid: true, type: 'direct' };
            } else {
                return { valid: false, error: 'Invalid session string format' };
            }
        } else {
            return { valid: true, type: 'json' };
        }

    } catch (error) {
        return { valid: false, error: 'Validation error: ' + error.message };
    }
}

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
 * Enhanced session testing with better error reporting
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
                phoneNumber: authState.state.creds?.me?.id?.split(':')[0] || 'Unknown',
                registrationId: authState.state.creds?.registrationId,
                registered: authState.state.creds?.registered
            };
        } else {
            const authState = await sessionStringToAuth(sessionString);
            logger.info('✅ Direct session parsing successful');
            
            return {
                success: true,
                type: validation.type,
                hasCredentials: !!authState.state.creds,
                phoneNumber: authState.state.creds?.me?.id?.split(':')[0] || 'Unknown',
                registrationId: authState.state.creds?.registrationId,
                registered: authState.state.creds?.registered
            };
        }
        
    } catch (error) {
        logger.error('❌ Session test failed:', error.message);
        return { success: false, error: error.message };
    }
}
