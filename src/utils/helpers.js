import { config } from '../config/config.js';

// Rate limiting storage
const rateLimits = new Map();

/**
 * Parse command from message text
 */
export function parseCommand(messageText) {
    if (!messageText || typeof messageText !== 'string') {
        return null;
    }
    
    const text = messageText.trim();
    
    // Check if message starts with prefix
    if (!text.startsWith(config.PREFIX)) {
        return null;
    }
    
    // Remove prefix and split into command and arguments
    const withoutPrefix = text.slice(config.PREFIX.length).trim();
    if (!withoutPrefix) {
        return null;
    }
    
    const parts = withoutPrefix.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    return {
        command,
        args,
        fullArgs: args.join(' '),
        originalText: messageText
    };
}

/**
 * Get text content from WhatsApp message object
 */
export function getMessageContent(messageObj) {
    if (!messageObj) return null;
    
    // Handle different message types
    if (messageObj.conversation) {
        return messageObj.conversation;
    }
    
    if (messageObj.extendedTextMessage?.text) {
        return messageObj.extendedTextMessage.text;
    }
    
    if (messageObj.imageMessage?.caption) {
        return messageObj.imageMessage.caption;
    }
    
    if (messageObj.videoMessage?.caption) {
        return messageObj.videoMessage.caption;
    }
    
    if (messageObj.documentMessage?.caption) {
        return messageObj.documentMessage.caption;
    }
    
    // Handle quoted messages
    if (messageObj.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quoted = messageObj.extendedTextMessage.contextInfo.quotedMessage;
        return getMessageContent(quoted);
    }
    
    return null;
}

/**
 * Extract sender ID from message
 */
export function getSenderId(message) {
    if (!message?.key) return 'unknown';
    
    // For group messages, get the participant
    if (message.key.participant) {
        return message.key.participant.split('@')[0];
    }
    
    // For private messages, get from remoteJid
    if (message.key.remoteJid) {
        return message.key.remoteJid.split('@')[0];
    }
    
    return 'unknown';
}

/**
 * Check and enforce rate limiting
 */
export function checkRateLimit(userId) {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxRequests = config.MAX_COMMANDS_PER_MINUTE || 10;
    
    // Get user's request history
    if (!rateLimits.has(userId)) {
        rateLimits.set(userId, []);
    }
    
    const requests = rateLimits.get(userId);
    
    // Remove old requests outside the window
    const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
    
    // Check if user has exceeded limit
    if (validRequests.length >= maxRequests) {
        return false;
    }
    
    // Add current request
    validRequests.push(now);
    rateLimits.set(userId, validRequests);
    
    return true;
}

/**
 * Format phone number for WhatsApp
 */
export function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;
    
    // Remove all non-digits
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Add country code if missing (assuming Nigerian numbers)
    if (cleaned.length === 10 && !cleaned.startsWith('234')) {
        cleaned = '234' + cleaned;
    }
    
    // Add WhatsApp suffix
    return cleaned + '@s.whatsapp.net';
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    
    const parts = [];
    
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    
    return parts.join(' ');
}

/**
 * Format file size in bytes to human readable
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Escape markdown characters
 */
export function escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[*_`~]/g, '\\$&');
}

/**
 * Clean and validate URL
 */
export function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Generate random string
 */
export function generateRandomString(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
}

/**
 * Sleep/delay function
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Truncate text to specified length
 */
export function truncateText(text, maxLength = 100) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Check if user is mentioned in message
 */
export function isUserMentioned(message, userId) {
    const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const userJid = userId.includes('@') ? userId : `${userId}@s.whatsapp.net`;
    return mentions.includes(userJid);
}

/**
 * Get current time in specified timezone
 */
export function getCurrentTime(timezone = config.TIMEZONE) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(new Date());
}

/**
 * Clean periodic data (rate limits, caches, etc.)
 */
export function cleanPeriodicData() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Clean old rate limit entries
    for (const [userId, requests] of rateLimits.entries()) {
        const validRequests = requests.filter(timestamp => timestamp > oneHourAgo);
        
        if (validRequests.length === 0) {
            rateLimits.delete(userId);
        } else {
            rateLimits.set(userId, validRequests);
        }
    }
}

// Clean periodic data every hour
setInterval(cleanPeriodicData, 60 * 60 * 1000);

/**
 * Validate and normalize command arguments
 */
export function validateArgs(args, schema) {
    const result = {
        valid: true,
        errors: [],
        values: {}
    };
    
    for (const [key, config] of Object.entries(schema)) {
        const value = args[config.index];
        
        // Check required fields
        if (config.required && (!value || value.trim() === '')) {
            result.valid = false;
            result.errors.push(`${key} is required`);
            continue;
        }
        
        // Skip validation for optional empty fields
        if (!value || value.trim() === '') {
            result.values[key] = config.default || null;
            continue;
        }
        
        // Type validation
        let processedValue = value.trim();
        
        if (config.type === 'number') {
            processedValue = parseFloat(processedValue);
            if (isNaN(processedValue)) {
                result.valid = false;
                result.errors.push(`${key} must be a number`);
                continue;
            }
            
            if (config.min !== undefined && processedValue < config.min) {
                result.valid = false;
                result.errors.push(`${key} must be at least ${config.min}`);
                continue;
            }
            
            if (config.max !== undefined && processedValue > config.max) {
                result.valid = false;
                result.errors.push(`${key} must be at most ${config.max}`);
                continue;
            }
        }
        
        if (config.type === 'url' && !isValidUrl(processedValue)) {
            result.valid = false;
            result.errors.push(`${key} must be a valid URL`);
            continue;
        }
        
        result.values[key] = processedValue;
    }
    
    return result;
}
