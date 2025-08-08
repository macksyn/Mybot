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
        
        if (stats.mtime.getTime() < t
