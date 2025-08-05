import moment from 'moment';
import { config } from '../config/config.js';

// Rate limiting storage
const rateLimitMap = new Map();

// Delay function (like the working implementation)
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Extract command and arguments from message text
 */
export function parseCommand(messageText) {
    if (!messageText.startsWith(config.PREFIX)) return null;
    const args = messageText.slice(config.PREFIX.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();
    if (!command) return null;
    
    return { command, args };
}

/**
 * Rate limiting helper
 */
export function checkRateLimit(userId) {
    const now = Date.now();
    const userLimits = rateLimitMap.get(userId) || [];
    // Remove old entries (older than 1 minute)
    const recentCommands = userLimits.filter(time => now - time < 60000);
    if (recentCommands.length >= config.MAX_COMMANDS_PER_MINUTE) {
        return false;
    }
    
    // Add current command
    recentCommands.push(now);
    rateLimitMap.set(userId, recentCommands);
    
    return true;
}

/**
 * Extract message content
 */
export function getMessageContent(message) {
    // Handle different message types
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;
    if (message.documentMessage?.caption) return message.documentMessage.caption;
    
    return null;
}

/**
 * Get sender ID
 */
export function getSenderId(message) {
    return message.key.fromMe ? 'me' : (message.key.participant || message.key.remoteJid);
}

/**
 * Check if user is owner
 */
export function isOwner(senderId) {
    if (!config.OWNER_NUMBER) return false;
    const ownerJid = config.OWNER_NUMBER.replace(/\D/g, '') + '@s.whatsapp.net';
    return senderId === ownerJid || senderId === config.OWNER_NUMBER.replace(/\D/g, '');
}

/**
 * Check if user is admin
 */
export function isAdmin(senderId) {
    if (isOwner(senderId)) return true;
    
    const cleanSenderId = senderId.replace(/\D/g, '');
    return config.ADMIN_NUMBERS.some(adminNum => {
        const cleanAdminNum = adminNum.replace(/\D/g, '');
        return cleanSenderId === cleanAdminNum;
    });
}

/**
 * Format phone number for WhatsApp
 */
export function formatPhoneNumber(number) {
    // Remove all non-digits
    const cleaned = number.replace(/\D/g, '');
    // Add country code if missing (assuming it's a 10-digit number without country code)
    if (cleaned.length === 10) {
        return '1' + cleaned; // Add US country code as default
    }
    return cleaned;
}

/**
 * Create WhatsApp JID from number
 */
export function createJid(number) {
    const cleaned = number.replace(/\D/g, '');
    return cleaned + '@s.whatsapp.net';
}

/**
 * Extract number from JID
 */
export function extractNumber(jid) {
    return jid.split('@')[0];
}

/**
 * Sleep function
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
 * Format file size (needed by admin.js)
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration in seconds to human readable (needed by info.js)
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
 * Truncate text to specified length
 */
export function truncateText(text, maxLength = 100) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Check if message is from group
 */
export function isGroupMessage(messageInfo) {
    return messageInfo.key.remoteJid?.endsWith('@g.us');
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
