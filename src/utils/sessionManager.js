import { BufferJSON, initAuthCreds } from '@whiskeysockets/baileys';
import { logger } from './logger.js';
import { File } from 'megajs';
import fs from 'fs-extra';
import path from 'path';

/**
 * Enhanced Mega.nz session manager with proper error handling
 */

// Create proper auth state structure for Baileys
function createAuthState(creds, keys = {}) {
    return {
        state: {
            creds: creds || initAuthCreds(),
            keys: keys instanceof Map ? keys : new Map(Object.entries(keys || {}))
        }
    };
}

/**
 * Download session data from Mega.nz
 */
async function downloadFromMega(megaUrl, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            logger.info(`📥 Downloading from Mega.nz (attempt ${attempt}/${retries})...`);
            logger.info(`🔗 URL: ${megaUrl}`);
            
            const file = File.fromURL(megaUrl);
            
            // Add timeout for download
            const timeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Download timeout')), 30000)
            );
            
            const download = file.downloadBuffer();
            const buffer = await Promise.race([download, timeout]);
            
            logger.info(`✅ Downloaded ${buffer.length} bytes from Mega.nz`);
            
            // Parse JSON
            const jsonString = buffer.toString('utf-8');
            let sessionData;
            
            try {
                sessionData = JSON.parse(jsonString, BufferJSON.reviver);
            } catch (parseError) {
                logger.error('❌ JSON parsing failed:', parseError.message);
                throw new Error('Downloaded file is not valid JSON format');
            }
            
            // Validate session data
            if (!sessionData || typeof sessionData !== 'object') {
                throw new Error('Invalid session data structure');
            }
            
            logger.info('✅ Session data parsed successfully');
            return sessionData;
            
        } catch (error) {
            logger.warn(`⚠️  Attempt ${attempt} failed:`, error.message);
            
            if (attempt === retries) {
                throw new Error(`Failed to download after ${retries} attempts: ${error.message}`);
            }
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
    }
}

/**
 * Process and validate session data
 */
function processSessionData(rawData) {
    try {
        logger.info('🔍 Processing session data...');
        
        let sessionData;
        
        // Check if data is in nested format (new format)
        if (rawData.creds && typeof rawData.creds === 'object') {
            logger.info('📋 Found nested session format');
            sessionData = rawData;
        } else {
            // Handle flat format (legacy)
            logger.info('🔄 Converting flat format to nested format...');
            
            // Validate essential fields
            const requiredFields = ['noiseKey', 'pairingEphemeralKeyPair', 'signedIdentityKey', 'registrationId'];
            const missingFields = requiredFields.filter(field => !rawData[field]);
            
            if (missingFields.length > 0) {
                logger.warn(`⚠️  Missing fields: ${missingFields.join(', ')}`);
                // Continue anyway - Baileys might handle missing fields
            }
            
            sessionData = {
                creds: rawData,
                keys: {}
            };
        }
        
        // Ensure keys structure
        if (!sessionData.keys) {
            sessionData.keys = {};
        }
        
        // Extract session info for logging
        const phoneNumber = sessionData.creds?.me?.id?.split(':')[0] || 'Unknown';
        const registered = sessionData.creds?.registered;
        const keyCount = Object.keys(sessionData.keys).length;
        
        logger.info('📊 Session Information:');
        logger.info(`   📱 Phone: ${phoneNumber}`);
        logger.info(`   ✅ Registered: ${registered ? 'Yes' : 'No'}`);
        logger.info(`   🔑 Keys: ${keyCount}`);
        logger.info(`   🆔 Registration ID: ${sessionData.creds?.registrationId || 'Unknown'}`);
        
        return sessionData;
        
    } catch (error) {
        logger.error('❌ Failed to process session data:', error.message);
        throw error;
    }
}

/**
 * Handle Mega.nz session download and processing
 */
async function handleMegaSession(sessionString) {
    try {
        const parts = sessionString.split('~');
        if (parts.length !== 2) {
            throw new Error('Invalid Mega session format. Expected: "prefix~fileId#key"');
        }

        const [prefix, megaData] = parts;
        const megaParts = megaData.split('#');
        
        if (megaParts.length !== 2) {
            throw new Error('Invalid Mega data format. Expected: "fileId#decryptionKey"');
        }
        
        const [fileId, decryptionKey] = megaParts;

        logger.info('📝 Mega.nz Session Details:');
        logger.info(`   Prefix: ${prefix}`);
        logger.info(`   File ID: ${fileId}`);
        logger.info(`   Key Length: ${decryptionKey.length} chars`);

        // Check cache first
        const cached = await loadCachedSession(prefix);
        if (cached) {
            logger.info('⚡ Using cached session data');
            return cached;
        }

        // Download from Mega.nz
        const megaUrl = `https://mega.nz/file/${fileId}#${decryptionKey}`;
        const rawData = await downloadFromMega(megaUrl);
        
        // Process the session data
        const sessionData = processSessionData(rawData);
        
        // Create auth state
        const authState = createAuthState(sessionData.creds, sessionData.keys);
        
        // Cache the session for future use
        await cacheSession(sessionData, prefix);
        
        logger.info('✅ Mega.nz session loaded successfully');
        return authState;

    } catch (error) {
        logger.error('❌ Failed to handle Mega session:', error.message);
        throw error;
    }
}

/**
 * Handle direct session string (base64 encoded JSON)
 */
async function handleDirectSession(sessionString) {
    try {
        logger.info('📝 Processing direct session string...');
        
        let sessionData;
        
        // Try to parse as JSON first
        try {
            sessionData = JSON.parse(sessionString, BufferJSON.reviver);
        } catch {
            // Try base64 decode then parse
            try {
                const decoded = Buffer.from(sessionString, 'base64').toString('utf-8');
                sessionData = JSON.parse(decoded, BufferJSON.reviver);
            } catch {
                throw new Error('Invalid session string format');
            }
        }
        
        // Process the session data
        const processedData = processSessionData(sessionData);
        
        // Create auth state
        const authState = createAuthState(processedData.creds, processedData.keys);
        
        logger.info('✅ Direct session loaded successfully');
        return authState;
        
    } catch (error) {
        logger.error('❌ Failed to handle direct session:', error.message);
        throw error;
    }
}

/**
 * Main function to convert session string to auth state
 */
export async function sessionStringToAuth(sessionString) {
    try {
        if (!sessionString || sessionString === 'your-session-string-here') {
            throw new Error('Invalid or empty session string');
        }

        logger.info('🔄 Converting session string to auth state...');

        // Detect session type
        if (sessionString.includes('~') && sessionString.includes('#')) {
            logger.info('🔗 Detected Mega.nz session format');
            return await handleMegaSession(sessionString);
        } else {
            logger.info('📝 Detected direct session format');
            return await handleDirectSession(sessionString);
        }

    } catch (error) {
        logger.error('❌ Session conversion failed:', error.message);
        throw new Error(`Session conversion failed: ${error.message}`);
    }
}

/**
 * Cache session data for faster subsequent loads
 */
async function cacheSession(sessionData, prefix) {
    try {
        const cacheDir = './sessions/cache';
        await fs.ensureDir(cacheDir);
        
        const cacheData = {
            creds: sessionData.creds,
            keys: sessionData.keys,
            cachedAt: Date.now(),
            prefix: prefix
        };
        
        const cacheFile = path.join(cacheDir, `${prefix}_cached.json`);
        await fs.writeJSON(cacheFile, cacheData, {
            replacer: BufferJSON.replacer,
            spaces: 2
        });
        
        logger.debug(`💾 Session cached: ${cacheFile}`);
        
    } catch (error) {
        logger.debug('⚠️  Could not cache session:', error.message);
    }
}

/**
 * Load cached session if available and valid
 */
async function loadCachedSession(prefix) {
    try {
        const cacheFile = path.join('./sessions/cache', `${prefix}_cached.json`);
        
        if (!await fs.pathExists(cacheFile)) {
            return null;
        }
        
        // Check cache age (max 2 hours)
        const stats = await fs.stat(cacheFile);
        const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
        
        if (stats.mtime.getTime() < twoHoursAgo) {
            logger.debug('⏰ Cached session expired');
            await fs.remove(cacheFile);
            return null;
        }
        
        const cachedData = await fs.readJSON(cacheFile, { reviver: BufferJSON.reviver });
        
        // Create auth state from cached data
        const authState = createAuthState(cachedData.creds, cachedData.keys);
        
        logger.debug('⚡ Loaded cached session successfully');
        return authState;
        
    } catch (error) {
        logger.debug('⚠️  Could not load cached session:', error.message);
        return null;
    }
}

/**
 * Validate session string format
 */
export function validateSessionString(sessionString) {
    try {
        if (!sessionString || typeof sessionString !== 'string') {
            return { valid: false, error: 'Session string is empty or not a string' };
        }

        if (sessionString === 'your-session-string-here') {
            return { valid: false, error: 'Please replace placeholder with actual session string' };
        }

        if (sessionString.length < 20) {
            return { valid: false, error: 'Session string too short' };
        }

        // Check for Mega.nz format
        if (sessionString.includes('~') && sessionString.includes('#')) {
            const parts = sessionString.split('~');
            if (parts.length === 2) {
                const [prefix, megaData] = parts;
                const megaParts = megaData.split('#');
                
                if (megaParts.length === 2 && megaParts[0] && megaParts[1]) {
                    return { 
                        valid: true, 
                        type: 'mega', 
                        prefix: prefix.trim()
                    };
                }
            }
            return { valid: false, error: 'Invalid Mega format. Expected: prefix~fileId#key' };
        }

        // Check for direct session (JSON or base64)
        try {
            JSON.parse(sessionString);
            return { valid: true, type: 'json' };
        } catch {
            try {
                const decoded = Buffer.from(sessionString, 'base64').toString('utf-8');
                JSON.parse(decoded);
                return { valid: true, type: 'base64' };
            } catch {
                return { valid: false, error: 'Invalid session format - not JSON or base64' };
            }
        }

    } catch (error) {
        return { valid: false, error: `Validation error: ${error.message}` };
    }
}

/**
 * Get session information without full processing
 */
export function getSessionInfo(sessionString) {
    try {
        const validation = validateSessionString(sessionString);
        
        if (!validation.valid) {
            return {
                valid: false,
                type: 'invalid',
                error: validation.error
            };
        }

        if (validation.type === 'mega') {
            return {
                valid: true,
                type: 'mega',
                prefix: validation.prefix,
                source: 'Mega.nz',
                description: 'Session stored on Mega.nz cloud storage'
            };
        }

        // For direct sessions, try to extract basic info
        try {
            let sessionData;
            
            if (validation.type === 'json') {
                sessionData = JSON.parse(sessionString, BufferJSON.reviver);
            } else if (validation.type === 'base64') {
                const decoded = Buffer.from(sessionString, 'base64').toString('utf-8');
                sessionData = JSON.parse(decoded, BufferJSON.reviver);
            }

            const phoneNumber = sessionData?.creds?.me?.id?.split(':')[0] || 
                               sessionData?.me?.id?.split(':')[0] || 'Unknown';
            
            return {
                valid: true,
                type: validation.type,
                phoneNumber: phoneNumber,
                source: 'Direct',
                description: 'Session data embedded in string'
            };
            
        } catch {
            return {
                valid: true,
                type: validation.type,
                phoneNumber: 'Unknown',
                source: 'Direct',
                description: 'Session data embedded in string'
            };
        }

    } catch (error) {
        return {
            valid: false,
            type: 'error',
            error: error.message
        };
    }
}

/**
 * Normalize session string (remove quotes, whitespace)
 */
export function normalizeSessionString(sessionString) {
    if (!sessionString) return '';
    
    // Trim whitespace
    sessionString = sessionString.trim();
    
    // Remove surrounding quotes
    if ((sessionString.startsWith('"') && sessionString.endsWith('"')) ||
        (sessionString.startsWith("'") && sessionString.endsWith("'"))) {
        sessionString = sessionString.slice(1, -1).trim();
    }
    
    return sessionString;
}

/**
 * Test session connectivity and validity
 */
export async function testSession(sessionString) {
    try {
        logger.info('🧪 Testing session...');
        
        const validation = validateSessionString(sessionString);
        if (!validation.valid) {
            return { 
                success: false, 
                error: validation.error,
                type: 'validation'
            };
        }
        
        // Test session conversion
        const authState = await sessionStringToAuth(sessionString);
        
        // Validate auth state structure
        if (!authState?.state?.creds) {
            return {
                success: false,
                error: 'Invalid auth state - missing credentials',
                type: 'structure'
            };
        }
        
        // Extract session details
        const phoneNumber = authState.state.creds?.me?.id?.split(':')[0] || 'Unknown';
        const registered = authState.state.creds?.registered;
        const keyCount = authState.state.keys?.size || 0;
        
        return {
            success: true,
            type: validation.type,
            phoneNumber: phoneNumber,
            registered: registered,
            keyCount: keyCount,
            hasCredentials: !!authState.state.creds,
            hasKeys: keyCount > 0
        };
        
    } catch (error) {
        logger.error('❌ Session test failed:', error.message);
        return { 
            success: false, 
            error: error.message,
            type: 'processing'
        };
    }
}

/**
 * Convert auth state back to session string (for backup purposes)
 */
export function authToSessionString(authState) {
    try {
        if (!authState?.state?.creds) {
            throw new Error('Invalid auth state - missing credentials');
        }

        const sessionData = {
            creds: authState.state.creds,
            keys: {}
        };

        // Convert keys Map to object
        if (authState.state.keys instanceof Map) {
            authState.state.keys.forEach((value, key) => {
                sessionData.keys[key] = value;
            });
        }

        // Convert to JSON and encode
        const jsonString = JSON.stringify(sessionData, BufferJSON.replacer);
        const base64String = Buffer.from(jsonString).toString('base64');
        
        return base64String;
        
    } catch (error) {
        throw new Error(`Failed to convert auth state to session string: ${error.message}`);
    }
}

/**
 * Clean expired cache files periodically
 */
export async function cleanExpiredCache() {
    try {
        const cacheDir = './sessions/cache';
        
        if (!await fs.pathExists(cacheDir)) {
            return;
        }
        
        const files = await fs.readdir(cacheDir);
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        for (const file of files) {
            if (file.endsWith('_cached.json')) {
                const filePath = path.join(cacheDir, file);
                const stats = await fs.stat(filePath);
                
                if (stats.mtime.getTime() < oneHourAgo) {
                    await fs.remove(filePath);
                    logger.debug(`🗑️  Removed expired cache: ${file}`);
                }
            }
        }
        
    } catch (error) {
        logger.debug('Could not clean expired cache:', error.message);
    }
}

// Clean expired cache every hour
setInterval(cleanExpiredCache, 60 * 60 * 1000);

/**
 * Get session file size and metadata
 */
export async function getSessionMetadata(sessionString) {
    try {
        const validation = validateSessionString(sessionString);
        
        if (!validation.valid) {
            return { error: validation.error };
        }
        
        if (validation.type === 'mega') {
            const parts = sessionString.split('~')[1].split('#');
            const [fileId, decryptionKey] = parts;
            
            return {
                type: 'mega',
                fileId: fileId,
                keyLength: decryptionKey.length,
                prefix: validation.prefix,
                estimatedSize: 'Unknown (will be determined on download)'
            };
        } else {
            let sessionData;
            
            if (validation.type === 'json') {
                sessionData = JSON.parse(sessionString);
            } else if (validation.type === 'base64') {
                const decoded = Buffer.from(sessionString, 'base64').toString('utf-8');
                sessionData = JSON.parse(decoded);
            }
            
            const size = JSON.stringify(sessionData).length;
            const hasKeys = sessionData.keys && Object.keys(sessionData.keys).length > 0;
            const hasCreds = sessionData.creds && typeof sessionData.creds === 'object';
            
            return {
                type: validation.type,
                size: size,
                hasCredentials: hasCreds,
                hasKeys: hasKeys,
                keyCount: sessionData.keys ? Object.keys(sessionData.keys).length : 0
            };
        }
        
    } catch (error) {
        return { error: error.message };
    }
}
