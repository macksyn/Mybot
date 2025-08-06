import { File } from 'megajs';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';

class SessionManager {
    constructor() {
        this.sessionsDir = './sessions';
        this.ensureSessionsDir();
    }

    ensureSessionsDir() {
        if (!existsSync(this.sessionsDir)) {
            mkdirSync(this.sessionsDir, { recursive: true });
        }
    }

    /**
     * Detect session type and handle accordingly
     */
    async handleSession(sessionString, sessionId = 'default') {
        const sessionDir = join(this.sessionsDir, sessionId);
        
        // Ensure session directory exists
        if (!existsSync(sessionDir)) {
            mkdirSync(sessionDir, { recursive: true });
        }

        try {
            // Check if it's a Mega.nz URL
            if (this.isMegaUrl(sessionString)) {
                console.log('🔗 Detected Mega.nz session URL');
                await this.downloadFromMega(sessionString, sessionDir);
                return await useMultiFileAuthState(sessionDir);
            }
            
            // Check if it's a direct session string
            if (this.isDirectSessionString(sessionString)) {
                console.log('📝 Detected direct session string');
                return this.convertStringToAuthState(sessionString);
            }
            
            // If session files already exist, use them
            if (this.hasExistingSession(sessionDir)) {
                console.log('📁 Using existing session files');
                return await useMultiFileAuthState(sessionDir);
            }
            
            throw new Error('Invalid session format or no existing session found');
            
        } catch (error) {
            console.error('❌ Session handling failed:', error.message);
            throw error;
        }
    }

    /**
     * Check if string is a Mega.nz URL
     */
    isMegaUrl(str) {
        return str && (
            str.includes('mega.nz') || 
            str.includes('mega.co.nz') || 
            str.startsWith('https://mega.nz') ||
            str.includes('#!')
        );
    }

    /**
     * Check if string is a direct session string
     */
    isDirectSessionString(str) {
        return str && str.includes('~') && str.length > 50;
    }

    /**
     * Check if session directory has existing files
     */
    hasExistingSession(sessionDir) {
        const credsPath = join(sessionDir, 'creds.json');
        return existsSync(credsPath);
    }

    /**
     * Download session from Mega.nz
     */
    async downloadFromMega(megaUrl, sessionDir) {
        try {
            console.log('⬇️ Downloading session from Mega.nz...');
            
            // Extract file ID from Mega URL
            const fileId = this.extractMegaFileId(megaUrl);
            if (!fileId) {
                throw new Error('Could not extract file ID from Mega URL');
            }

            // Create Mega file instance
            const file = File.fromURL(megaUrl);
            
            // Download the file
            const data = await file.downloadBuffer();
            
            // Try to parse as JSON (single session file)
            try {
                const sessionData = JSON.parse(data.toString());
                
                // If it's a creds.json file
                if (sessionData.noiseKey || sessionData.pairingEphemeralKeyPair) {
                    const credsPath = join(sessionDir, 'creds.json');
                    writeFileSync(credsPath, JSON.stringify(sessionData, null, 2));
                    console.log('✅ Downloaded and saved creds.json');
                } else {
                    throw new Error('Unknown session file format');
                }
                
            } catch (parseError) {
                // If not JSON, try as ZIP file containing session files
                await this.extractSessionZip(data, sessionDir);
            }
            
        } catch (error) {
            console.error('❌ Failed to download from Mega:', error.message);
            throw new Error(`Mega download failed: ${error.message}`);
        }
    }

    /**
     * Extract Mega file ID from URL
     */
    extractMegaFileId(url) {
        // Handle different Mega URL formats
        const patterns = [
            /mega\.n?z\/file\/([a-zA-Z0-9_-]+)/,
            /mega\.n?z\/[#!]*([a-zA-Z0-9_-]+)/,
            /#!([a-zA-Z0-9_-]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        
        return null;
    }

    /**
     * Extract session files from ZIP buffer
     */
    async extractSessionZip(buffer, sessionDir) {
        try {
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(buffer);
            
            // Extract all files
            for (const [filename, file] of Object.entries(zipContent.files)) {
                if (!file.dir) {
                    const content = await file.async('string');
                    const filePath = join(sessionDir, filename);
                    writeFileSync(filePath, content);
                    console.log(`✅ Extracted: ${filename}`);
                }
            }
            
        } catch (error) {
            throw new Error(`Failed to extract ZIP: ${error.message}`);
        }
    }

    /**
     * Convert direct session string to auth state
     */
    convertStringToAuthState(sessionString) {
        try {
            // Parse session string format: "prefix~base64data"
            const [prefix, encodedData] = sessionString.split('~');
            
            if (!encodedData) {
                throw new Error('Invalid session string format');
            }

            // Decode base64
            const decodedData = Buffer.from(encodedData, 'base64').toString('utf-8');
            const sessionData = JSON.parse(decodedData);

            // Convert to Baileys auth state format
            return {
                state: {
                    creds: sessionData.creds || sessionData,
                    keys: sessionData.keys || {}
                },
                saveCreds: () => {}, // No-op for string-based sessions
                saveKeys: () => {}   // No-op for string-based sessions
            };
            
        } catch (error) {
            throw new Error(`Session string conversion failed: ${error.message}`);
        }
    }

    /**
     * Create session string from auth state (for backup)
     */
    createSessionString(authState, prefix = 'SESSION') {
        try {
            const sessionData = {
                creds: authState.state.creds,
                keys: authState.state.keys
            };
            
            const jsonString = JSON.stringify(sessionData);
            const encodedData = Buffer.from(jsonString, 'utf-8').toString('base64');
            
            return `${prefix}~${encodedData}`;
            
        } catch (error) {
            throw new Error(`Failed to create session string: ${error.message}`);
        }
    }

    /**
     * Validate session
     */
    async validateSession(sessionPath) {
        try {
            const credsPath = join(sessionPath, 'creds.json');
            
            if (!existsSync(credsPath)) {
                return { valid: false, error: 'creds.json not found' };
            }
            
            const creds = JSON.parse(readFileSync(credsPath, 'utf-8'));
            
            // Check for required fields
            const requiredFields = ['noiseKey', 'pairingEphemeralKeyPair', 'signedIdentityKey'];
            const missingFields = requiredFields.filter(field => !creds[field]);
            
            if (missingFields.length > 0) {
                return { 
                    valid: false, 
                    error: `Missing required fields: ${missingFields.join(', ')}` 
                };
            }
            
            return { valid: true };
            
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Clean up old sessions
     */
    cleanupOldSessions(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days
        try {
            const { readdirSync, statSync, rmSync } = require('fs');
            const sessions = readdirSync(this.sessionsDir);
            
            sessions.forEach(sessionId => {
                const sessionPath = join(this.sessionsDir, sessionId);
                const stats = statSync(sessionPath);
                
                if (Date.now() - stats.mtime.getTime() > maxAge) {
                    rmSync(sessionPath, { recursive: true, force: true });
                    console.log(`🗑️ Cleaned up old session: ${sessionId}`);
                }
            });
            
        } catch (error) {
            console.error('❌ Session cleanup failed:', error.message);
        }
    }
}

export default SessionManager;
