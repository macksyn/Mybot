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

        // Check if it's a Mega.nz identifier format - FIXED LOGIC
        if (sessionString.includes('~') && sessionString.includes('#')) {
            logger.info('🔗 Detected Mega.nz session format');
            return await handleMegaSession(sessionString);
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

        logger.info(`📥 Downloading session from Mega.nz (File ID: ${fileId})`);

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
        
        // Download from Mega
        const sessionData = await downloadFromMega(megaUrl);
        
        // Cache the session locally for faster future access
        await cacheSession(sessionData, prefix);
        
        return {
            state: {
                creds: sessionData.creds,
                keys: sessionData.keys || {}
            }
        };

    } catch (error) {
        logger.error('Failed to handle Mega session:', error.message);
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
        
        // Create file instance from URL
        const file = File.fromURL(megaUrl);
        
        // Download the file buffer
        logger.info('📦 Downloading session file...');
        const buffer = await file.downloadBuffer();
        
        logger.info(`✅ Downloaded ${buffer.length} bytes from Mega.nz`);
        
        // Try to parse as JSON
        const jsonString = buffer.toString('utf-8');
        const sessionData = JSON.parse(jsonString, BufferJSON.reviver);
        
        // Validate the downloaded session data
        if (!sessionData.creds) {
            throw new Error('Downloaded file does not contain valid session credentials');
        }
        
        logger.info('✅ Session data validated successfully');
        return sessionData;
        
    } catch (error) {
        logger.error('❌ Mega.nz download failed:', error.message);
        
        // Provide helpful error messages
        if (error.message.includes('ENOTFOUND') || error.message.includes('network')) {
            throw new Error('Network error: Could not connect to Mega.nz. Check your internet connection.');
        } else if (error.message.includes('404') || error.message.includes('not found')) {
            throw new Error('File not found: The Mega.nz link may be expired or invalid.');
        } else if (error.message.includes('JSON')) {
            throw new Error('Invalid session file: The downloaded file is not valid JSON session data.');
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
 * Validate session string format - FIXED LOGIC
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

        // FIXED: Check for Mega.nz format first (both ~ and # must be present)
        if (sessionString.includes('~') && sessionString.includes('#')) {
            const parts = sessionString.split('~');
            if (parts.length === 2) {
                const [prefix, megaData] = parts;
                const megaParts = megaData.split('#');
                if (megaParts.length === 2 && megaParts[0] && megaParts[1]) {
                    return { valid: true, type: 'mega', prefix };
                }
            }
            return { valid: false, error: 'Invalid Mega format. Expected: prefix~fileId#key' };
        } else if (sessionString.includes('~')) {
            // Direct session string format
            return { valid: true, type: 'direct' };
        } else {
            // Raw JSON format
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
