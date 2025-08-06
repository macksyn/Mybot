import { BufferJSON } from '@whiskeysockets/baileys';
import { logger } from './logger.js';

/**
 * Convert session string to Baileys auth state
 * Supports formats like "malvin~3EB..." or direct base64/JSON strings
 */
export async function sessionStringToAuth(sessionString) {
    try {
        if (!sessionString || sessionString === 'your-session-string-here') {
            throw new Error('Invalid session string');
        }

        let sessionData;
        
        // Handle different session string formats
        if (sessionString.includes('~')) {
            // Format: "malvin~base64data" or similar
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
                try {
                    sessionData = JSON.parse(data, BufferJSON.reviver);
                } catch (jsonError) {
                    throw new Error('Could not decode session data: ' + jsonError.message);
                }
            }
        } else {
            // Direct JSON string or base64 encoded JSON
            try {
                // Try direct JSON parse first
                sessionData = JSON.parse(sessionString, BufferJSON.reviver);
            } catch (directJsonError) {
                try {
                    // Try base64 decode then JSON parse
                    const decoded = Buffer.from(sessionString, 'base64').toString();
                    sessionData = JSON.parse(decoded, BufferJSON.reviver);
                } catch (base64Error) {
                    throw new Error('Could not parse session string as JSON or base64: ' + base64Error.message);
                }
            }
        }

        // Validate session data structure
        if (!sessionData || typeof sessionData !== 'object') {
            throw new Error('Session data is not a valid object');
        }

        // Check for required fields in session data
        const requiredFields = ['creds'];
        for (const field of requiredFields) {
            if (!sessionData[field]) {
                throw new Error(`Missing required field in session data: ${field}`);
            }
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
        logger.error('Failed to convert session string to auth state:', error.message);
        throw new Error(`Session string conversion failed: ${error.message}`);
    }
}

/**
 * Convert Baileys auth state to session string
 * Useful for backing up or transferring sessions
 */
export function authToSessionString(authState, prefix = 'groq') {
    try {
        const sessionData = {
            creds: authState.creds,
            keys: authState.keys || {}
        };

        // Convert to JSON string with BufferJSON replacer
        const jsonString = JSON.stringify(sessionData, BufferJSON.replacer);
        
        // Encode as base64
        const base64Data = Buffer.from(jsonString).toString('base64');
        
        // Return with prefix
        return `${prefix}~${base64Data}`;

    } catch (error) {
        logger.error('Failed to convert auth state to session string:', error.message);
        throw new Error(`Auth state conversion failed: ${error.message}`);
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

        if (sessionString.length < 10) {
            return { valid: false, error: 'Session string too short' };
        }

        // Try to convert to validate structure
        try {
            sessionStringToAuth(sessionString);
            return { valid: true };
        } catch (error) {
            return { valid: false, error: error.message };
        }

    } catch (error) {
        return { valid: false, error: 'Validation error: ' + error.message };
    }
}

/**
 * Extract session info from session string
 */
export function getSessionInfo(sessionString) {
    try {
        const authState = sessionStringToAuth(sessionString);
        
        const info = {
            hasCredentials: !!authState.state.creds,
            hasKeys: !!authState.state.keys && Object.keys(authState.state.keys).length > 0,
            registered: !!authState.state.creds?.registered,
            phoneNumber: authState.state.creds?.me?.id?.split(':')[0] || 'Unknown'
        };

        return info;

    } catch (error) {
        logger.debug('Could not extract session info:', error.message);
        return {
            hasCredentials: false,
            hasKeys: false,
            registered: false,
            phoneNumber: 'Invalid session'
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
