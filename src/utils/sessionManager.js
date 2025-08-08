import { BufferJSON, initAuthCreds } from '@whiskeysockets/baileys';
import { logger } from './logger.js';
import { File } from 'megajs';
import fs from 'fs';
import path from 'path';

/**
 * Create proper keys structure for Baileys
 */
function createKeysStructure() {
    const keys = new Map();
    
    // Add required methods for Baileys compatibility
    keys.get = function(key) {
        return Map.prototype.get.call(this, key);
    };
    
    keys.set = function(key, value) {
        return Map.prototype.set.call(this, key, value);
    };
    
    keys.has = function(key) {
        return Map.prototype.has.call(this, key);
    };
    
    keys.delete = function(key) {
        return Map.prototype.delete.call(this, key);
    };
    
    keys.clear = function() {
        return Map.prototype.clear.call(this);
    };
    
    keys.forEach = function(callback) {
        return Map.prototype.forEach.call(this, callback);
    };
    
    keys.keys = function() {
        return Map.prototype.keys.call(this);
    };
    
    keys.values = function() {
        return Map.prototype.values.call(this);
    };
    
    keys.entries = function() {
        return Map.prototype.entries.call(this);
    };
    
    return keys;
}

/**
 * Enhanced session manager with proper Baileys compatibility
 */
async function downloadFromMega(megaUrl) {
    try {
        logger.info('⬇️ Connecting to Mega.nz...');
        logger.info(`📡 URL: ${megaUrl}`);
        
        const file = File.fromURL(megaUrl);
        logger.info('📦 Downloading session file...');
        const buffer = await file.downloadBuffer();
        
        logger.info(`✅ Downloaded ${buffer.length} bytes from Mega.nz`);
        
        const jsonString = buffer.toString('utf-8');
        logger.debug(`📄 File content preview: ${jsonString.substring(0, 100)}...`);
        
        let rawData;
        try {
            rawData = JSON.parse(jsonString, BufferJSON.reviver);
        } catch (parseError) {
            logger.error('❌ JSON parsing failed:', parseError.message);
            throw new Error('Downloaded file is not valid JSON format');
        }
        
        if (!rawData || typeof rawData !== 'object') {
            throw new Error('Downloaded file does not contain valid session object');
        }
        
        logger.info('📋 Analyzing session structure...');
        
        let sessionData;
        
        // Check if already in nested format
        if (rawData.creds && typeof rawData.creds === 'object') {
            logger.info('✅ Found nested session format');
            sessionData = rawData;
        } else {
            // Handle flat format
            logger.info('🔍 Detected flat session format');
            
            const essentialFields = ['noiseKey', 'signedIdentityKey', 'registrationId'];
            const hasEssentials = essentialFields.every(field => rawData[field] !== undefined);
            
            if (!hasEssentials) {
                const missing = essentialFields.filter(field => !rawData[field]);
                throw new Error(`Missing essential session fields: ${missing.join(', ')}`);
            }
            
            logger.info('🔄 Converting flat format to nested format...');
            
            // Create proper nested structure
            sessionData = {
                creds: { ...rawData },
                keys: {}  // Will be converted to proper Map structure
            };
            
            logger.info('✅ Successfully converted flat format to nested format');
        }
        
        // Ensure proper keys structure
        if (!sessionData.keys || typeof sessionData.keys !== 'object') {
            logger.info('📝 Initializing empty keys structure');
            sessionData.keys = {};
        }
        
        // Convert keys to Map if it's a plain object
        if (sessionData.keys.constructor === Object) {
            logger.info('🔄 Converting keys object to Map structure');
            const keysMap = createKeysStructure();
            
            // Copy existing keys to Map
            Object.entries(sessionData.keys).forEach(([key, value]) => {
                keysMap.set(key, value);
            });
            
            sessionData.keys = keysMap;
        }
        
        // Validate session structure
        if (!sessionData.creds) {
            throw new Error('Session data missing creds object after processing');
        }
        
        // Enhanced session info
        const phoneNumber = sessionData.creds.me?.id?.split(':')[0] || 'Unknown';
        const registered = sessionData.creds.registered;
        const keyCount = sessionData.keys.size || Object.keys(sessionData.keys).length || 0;
        const registrationId = sessionData.creds.registrationId;
        
        logger.info('✅ Session data processed successfully');
        logger.info(`📊 Session details:`);
        logger.info(`   📞 Phone: ${phoneNumber}`);
        logger.info(`   📋 Registered: ${registered}`);
        logger.info(`   🔑 Keys: ${keyCount}`);
        logger.info(`   🆔 Registration ID: ${registrationId}`);
        
        // Additional validation
        if (!sessionData.creds.noiseKey) {
            throw new Error('Missing noiseKey - authentication will fail');
        }
        
        if (!sessionData.creds.signedIdentityKey) {
            throw new Error('Missing signedIdentityKey - authentication will fail');
        }
        
        return sessionData;
        
    } catch (error) {
        logger.error('❌ Mega.nz download failed:', error.message);
        throw new Error(`Mega.nz download failed: ${error.message}`);
    }
}

/**
 * Handle Mega.nz session format with proper Baileys structure
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
            
            // Ensure cached session has proper keys structure
            if (cached.keys && cached.keys.constructor === Object) {
                const keysMap = createKeysStructure();
                Object.entries(cached.keys).forEach(([key, value]) => {
                    keysMap.set(key, value);
                });
                cached.keys = keysMap;
            }
            
            return {
                state: {
                    creds: cached.creds,
                    keys: cached.keys || createKeysStructure()
                }
            };
        }

        const megaUrl = `https://mega.nz/file/${fileId}#${decryptionKey}`;
        logger.info(`🔗 Mega URL: ${megaUrl}`);
        
        logger.info('⏳ Downloading WhatsApp session file from Mega.nz...');
        const sessionData = await downloadFromMega(megaUrl);
        
        // Cache the session
        await cacheSession(sessionData, prefix);
        
        logger.info('✅ Mega.nz session processed successfully');
        
        return {
            state: {
                creds: sessionData.creds,
                keys: sessionData.keys || createKeysStructure()
            }
        };

    } catch (error) {
        logger.error('Failed to handle Mega session:', error.message);
        throw error;
    }
}

/**
 * Main session string to auth conversion
 */
export async function sessionStringToAuth(sessionString) {
    try {
        if (!sessionString || sessionString === 'your-session-string-here') {
            throw new Error('Invalid session string');
        }

        // Check for Mega.nz format
        if (sessionString.includes('~')) {
            const parts = sessionString.split('~');
            if (parts.length === 2 && parts[1].includes('#')) {
                logger.info('🔗 Detected Mega.nz session format');
                return await handleMegaSession(sessionString);
            }
        }

        // Handle direct session (fallback)
        return await handleDirectSession(sessionString);

    } catch (error) {
        logger.error('Failed to convert session string to auth state:', error.message);
        throw new Error(`Session string conversion failed: ${error.message}`);
    }
}

/**
 * Handle direct session string format
 */
async function handleDirectSession(sessionString) {
    try {
        let sessionData;
        
        if (sessionString.includes('~')) {
            const parts = sessionString.split('~');
            if (parts.length !== 2) {
                throw new Error('Invalid session string format. Expected format: "prefix~data"');
            }
            
            const [prefix, data] = parts;
            logger.debug(`Session prefix: ${prefix}`);
            
            try {
                const decoded = Buffer.from(data, 'base64').toString();
                sessionData = JSON.parse(decoded, BufferJSON.reviver);
            } catch (decodeError) {
                sessionData = JSON.parse(data, BufferJSON.reviver);
            }
        } else {
            try {
                sessionData = JSON.parse(sessionString, BufferJSON.reviver);
            } catch (directJsonError) {
                const decoded = Buffer.from(sessionString, 'base64').toString();
                sessionData = JSON.parse(decoded, BufferJSON.reviver);
            }
        }

        if (!sessionData || typeof sessionData !== 'object') {
            throw new Error('Session data is not a valid object');
        }

        // Check format and convert if needed
        if (sessionData.creds && typeof sessionData.creds === 'object') {
            logger.debug('Found nested session format in direct session');
        } else {
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

        // Ensure proper keys structure
        if (!sessionData.keys) {
            sessionData.keys = createKeysStructure();
        } else if (sessionData.keys.constructor === Object) {
            const keysMap = createKeysStructure();
            Object.entries(sessionData.keys).forEach(([key, value]) => {
                keysMap.set(key, value);
            });
            sessionData.keys = keysMap;
        }

        logger.debug('Direct session data structure validated');
        
        return {
            state: {
                creds: sessionData.creds,
                keys: sessionData.keys
            }
        };

    } catch (error) {
        throw new Error(`Direct session parsing failed: ${error.message}`);
    }
}

/**
 * Cache session with proper serialization
 */
async function cacheSession(sessionData, prefix) {
    try {
        const cacheDir = './sessions/cache';
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        
        // Convert Map to object for JSON serialization
        const cacheableData = {
            creds: sessionData.creds,
            keys: sessionData.keys instanceof Map ? 
                Object.fromEntries(sessionData.keys) : 
                sessionData.keys
        };
        
        const cacheFile = path.join(cacheDir, `${prefix}_cached.json`);
        fs.writeFileSync(cacheFile, JSON.stringify(cacheableData, BufferJSON.replacer, 2));
        
        logger.debug(`💾 Session cached to: ${cacheFile}`);
        
    } catch (error) {
        logger.debug('Could not cache session:', error.message);
    }
}

/**
 * Load cached session with proper structure restoration
 */
async function loadCachedSession(prefix) {
    try {
        const cacheFile = path.join('./sessions/cache', `${prefix}_cached.json`);
        
        if (!fs.existsSync(cacheFile)) {
            return null;
        }
        
        // Check cache age (1 hour limit)
        const stats = fs.statSync(cacheFile);
        const hourAgo = Date.now() - (60 * 60 * 1000);
        
        if (stats.mtime.getTime() < hourAgo) {
            logger.debug('Cached session expired, will download fresh copy');
            return null;
        }
        
        const cachedData = fs.readFileSync(cacheFile, 'utf-8');
        const sessionData = JSON.parse(cachedData, BufferJSON.reviver);
        
        // Restore proper keys structure
        if (sessionData.keys && sessionData.keys.constructor === Object) {
            const keysMap = createKeysStructure();
            Object.entries(sessionData.keys).forEach(([key, value]) => {
                keysMap.set(key, value);
            });
            sessionData.keys = keysMap;
        }
        
        logger.info('✅ Using cached session data');
        return sessionData;
        
    } catch (error) {
        logger.debug('Could not load cached session:', error.message);
        return null;
    }
}

// Export other required functions
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

        try {
            const authState = await sessionStringToAuth(sessionString);
            
            return {
                hasCredentials: !!authState.state.creds,
                hasKeys: !!authState.state.keys,
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

export function normalizeSessionString(sessionString) {
    if (!sessionString) return '';
    
    sessionString = sessionString.trim();
    
    if ((sessionString.startsWith('"') && sessionString.endsWith('"')) ||
        (sessionString.startsWith("'") && sessionString.endsWith("'"))) {
        sessionString = sessionString.slice(1, -1);
    }
    
    return sessionString;
}

export async function testSession(sessionString) {
    try {
        logger.info('🧪 Testing session connectivity...');
        
        const validation = validateSessionString(sessionString);
        logger.info(`📝 Session validation: ${validation.valid ? '✅ Valid' : '❌ Invalid'} (Type: ${validation.type})`);
        
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }
        
        const authState = await sessionStringToAuth(sessionString);
        logger.info(`✅ Session ${validation.type} parsing successful`);
        
        return {
            success: true,
            type: validation.type,
            hasCredentials: !!authState.state.creds,
            hasKeys: !!authState.state.keys,
            phoneNumber: authState.state.creds?.me?.id?.split(':')[0] || 'Unknown',
            registrationId: authState.state.creds?.registrationId,
            registered: authState.state.creds?.registered
        };
        
    } catch (error) {
        logger.error('❌ Session test failed:', error.message);
        return { success: false, error: error.message };
    }
}
