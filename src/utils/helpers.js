import moment from 'moment';
import { config } from '../config/config.js';

/**
 * Extract command and arguments from message text
 */
export function parseCommand(text, prefix = config.PREFIX) {
    if (!text.startsWith(prefix)) return null;
    
    const args = text.slice(prefix.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();
    
    return { command, args };
}

/**
 * Format phone number for WhatsApp
 */
export function formatPhoneNumber(number) {
    // Remove all non-digit characters
    const cleaned = number.replace(/\D/g, '');
    
    // Add country code if missing
    if (!cleaned.startsWith('1') && cleaned.length === 10) {
        return `1${cleaned}@s.whatsapp.net`;
    }
    
    return `${cleaned}@s.whatsapp.net`;
}

/**
 * Check if user is admin
 */
export function isAdmin(phoneNumber) {
    const number = phoneNumber.replace('@s.whatsapp.net', '');
    return config.ADMIN_NUMBERS.includes(number);
}

/**
 * Check if user is owner
 */
export function isOwner(phoneNumber) {
    const number = phoneNumber.replace('@s.whatsapp.net', '');
    return number === config.OWNER_NUMBER;
}

/**
 * Format time with timezone
 */
export function formatTime(date = new Date(), timezone = config.TIMEZONE) {
    return moment(date).tz(timezone).format('YYYY-MM-DD HH:mm:ss');
}

/**
 * Validate URL
 */
export function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Generate random ID
 */
export function generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Sleep function
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format file size
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Truncate text to specified length
 */
export function truncateText(text, maxLength = 100) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Rate limiting helper
 */
const rateLimitMap = new Map();

export function checkRateLimit(userId, maxRequests = config.MAX_COMMANDS_PER_MINUTE) {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    if (!rateLimitMap.has(userId)) {
        rateLimitMap.set(userId, []);
    }
    
    const userRequests = rateLimitMap.get(userId);
    
    // Remove old requests outside the window
    const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
    
    if (validRequests.length >= maxRequests) {
        return false; // Rate limit exceeded
    }
    
    // Add current request
    validRequests.push(now);
    rateLimitMap.set(userId, validRequests);
    
    return true; // Request allowed
}

/**
 * Clean up rate limit map periodically
 */
setInterval(() => {
    const now = Date.now();
    const windowStart = now - 60000;
    
    for (const [userId, requests] of rateLimitMap.entries()) {
        const validRequests = requests.filter(timestamp => timestamp > windowStart);
        
        if (validRequests.length === 0) {
            rateLimitMap.delete(userId);
        } else {
            rateLimitMap.set(userId, validRequests);
        }
    }
}, 60000); // Clean up every minute

/**
 * Extract message content
 */
export function getMessageContent(message) {
    return (
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        message.videoMessage?.caption ||
        message.documentMessage?.caption ||
        ''
    );
}

/**
 * Check if message is from group
 */
export function isGroupMessage(messageInfo) {
    return messageInfo.key.remoteJid?.endsWith('@g.us');
}

/**
 * Get sender ID
 */
export function getSenderId(messageInfo) {
    return messageInfo.key.participant || messageInfo.key.remoteJid;
}

/**
 * Format duration in seconds to human readable
 */
export function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}