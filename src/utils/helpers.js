import moment from 'moment';
import { config } from '../config/config.js';

// Rate limiting storage
const rateLimitMap = new Map();

// Delay function
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
 * Get sender ID - Enhanced to handle all formats
 */
export function getSenderId(message) {
    return message.key.fromMe ? 'me' : (message.key.participant || message.key.remoteJid);
}

/**
 * Normalize phone number - removes all non-digits and handles country codes
 */
export function normalizePhoneNumber(number) {
    if (!number) return '';
    
    // Remove all non-digits
    let cleaned = number.replace(/\D/g, '');
    
    // Remove leading zeros
    cleaned = cleaned.replace(/^0+/, '');
    
    // Handle common country code formats
    if (cleaned.startsWith('234') && cleaned.length === 13) {
        // Nigerian number with country code
        return cleaned;
    } else if (cleaned.length === 10 && !cleaned.startsWith('234')) {
        // Nigerian number without country code
        return '234' + cleaned;
    }
    
    return cleaned;
}

/**
 * Extract phone number from JID
 */
export function extractPhoneFromJid(jid) {
    if (!jid) return '';
    
    // Handle different JID formats
    // Examples: 2348166353338@s.whatsapp.net, 2348166353338@c.us, etc.
    const phoneMatch = jid.match(/^(\d+)@/);
    return phoneMatch ? phoneMatch[1] : '';
}

/**
 * Check if user is owner - Enhanced with better matching
 */
export function isOwner(senderId) {
    if (!config.OWNER_NUMBER) return false;
    
    // Normalize the configured owner number
    const normalizedOwner = normalizePhoneNumber(config.OWNER_NUMBER);
    
    // Extract phone number from sender ID
    const senderPhone = extractPhoneFromJid(senderId);
    const normalizedSender = normalizePhoneNumber(senderPhone);
    
    // Debug logging
    console.log('Owner Check:', {
        configOwner: config.OWNER_NUMBER,
        normalizedOwner,
        senderId,
        senderPhone,
        normalizedSender,
        match: normalizedOwner === normalizedSender
    });
    
    // Check multiple formats
    const checks = [
        normalizedOwner === normalizedSender,
        normalizedOwner === normalizePhoneNumber(senderId),
        config.OWNER_NUMBER === senderPhone,
        senderId === createJid(config.OWNER_NUMBER)
    ];
    
    return checks.some(check => check);
}

/**
 * Check if user is admin - Enhanced with better matching
 */
export function isAdmin(senderId) {
    // Owner is always admin
    if (isOwner(senderId)) return true;
    
    if (!config.ADMIN_NUMBERS || config.ADMIN_NUMBERS.length === 0) return false;
    
    // Extract phone number from sender ID
    const senderPhone = extractPhoneFromJid(senderId);
    const normalizedSender = normalizePhoneNumber(senderPhone);
    
    // Check against all admin numbers
    return config.ADMIN_NUMBERS.some(adminNum => {
        const normalizedAdmin = normalizePhoneNumber(adminNum);
        
        // Debug logging for each admin check
        console.log('Admin Check:', {
            adminNum,
            normalizedAdmin,
            senderId,
            senderPhone,
            normalizedSender,
            match: normalizedAdmin === normalizedSender
        });
        
        // Multiple format checks
        return [
            normalizedAdmin === normalizedSender,
            normalizedAdmin === normalizePhoneNumber(senderId),
            adminNum === senderPhone,
            senderId === createJid(adminNum)
        ].some(check => check);
    });
}

/**
 * Format phone number for WhatsApp
 */
export function formatPhoneNumber(number) {
    return normalizePhoneNumber(number);
}

/**
 * Create WhatsApp JID from number
 */
export function createJid(number) {
    const cleaned = normalizePhoneNumber(number);
    return cleaned + '@s.whatsapp.net';
}

/**
 * Extract number from JID
 */
export function extractNumber(jid) {
    return extractPhoneFromJid(jid);
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
 * Debug function to check user permissions
 */
export function debugUserPermissions(senderId) {
    console.log('=== Permission Debug ===');
    console.log('Sender ID:', senderId);
    console.log('Owner Number Config:', config.OWNER_NUMBER);
    console.log('Admin Numbers Config:', config.ADMIN_NUMBERS);
    console.log('Is Owner:', isOwner(senderId));
    console.log('Is Admin:', isAdmin(senderId));
    console.log('Extracted Phone:', extractPhoneFromJid(senderId));
    console.log('Normalized Phone:', normalizePhoneNumber(extractPhoneFromJid(senderId)));
    console.log('=======================');
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
