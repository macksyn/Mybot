import moment from 'moment';
import { config } from '../config/config.js';
import { logger } from './logger.js';

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
 * Normalize phone number - Enhanced for better matching
 */
export function normalizePhoneNumber(number) {
    if (!number) return '';
    
    // Remove all non-digits
    let cleaned = number.toString().replace(/\D/g, '');
    
    // Remove leading zeros
    cleaned = cleaned.replace(/^0+/, '');
    
    // Handle Nigerian numbers specifically (since that's what's in your config)
    if (cleaned.startsWith('234')) {
        // Already has country code
        return cleaned;
    } else if (cleaned.length === 10) {
        // Likely a local Nigerian number without country code
        return '234' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
        // Nigerian format with leading 0
        return '234' + cleaned.substring(1);
    } else if (cleaned.length === 13 && cleaned.startsWith('234')) {
        // Already properly formatted
        return cleaned;
    }
    
    return cleaned;
}

/**
 * Extract phone number from JID - Enhanced
 */
export function extractPhoneFromJid(jid) {
    if (!jid) return '';
    
    // Handle different JID formats
    // Examples: 2348166353338@s.whatsapp.net, 2348166353338@c.us, etc.
    let phoneMatch;
    
    // Try different patterns
    phoneMatch = jid.match(/^(\d+)@/); // Standard format
    if (phoneMatch) return phoneMatch[1];
    
    phoneMatch = jid.match(/(\d+):/); // Some group formats
    if (phoneMatch) return phoneMatch[1];
    
    // If it's just a number
    if (/^\d+$/.test(jid)) return jid;
    
    return '';
}

/**
 * Enhanced owner checking with multiple validation methods
 */
export function isOwner(senderId) {
    if (!config.OWNER_NUMBER) {
        logger.debug('No OWNER_NUMBER configured');
        return false;
    }
    
    // Extract and normalize phone numbers
    const senderPhone = extractPhoneFromJid(senderId);
    const normalizedSender = normalizePhoneNumber(senderPhone);
    const normalizedOwner = normalizePhoneNumber(config.OWNER_NUMBER);
    
    // Multiple comparison methods
    const comparisons = [
        // Exact normalized match (most reliable)
        normalizedSender === normalizedOwner,
        
        // Direct sender phone match
        senderPhone === normalizedOwner,
        
        // Raw comparison
        normalizePhoneNumber(senderId) === normalizedOwner,
        
        // JID comparison
        senderId === createJid(config.OWNER_NUMBER),
        
        // Fallback: check if sender ends with owner number
        senderPhone.endsWith(normalizedOwner.slice(-10)),
        
        // Check last 10 digits match
        normalizedSender.slice(-10) === normalizedOwner.slice(-10)
    ];
    
    const isOwnerResult = comparisons.some(Boolean);
    
    // Debug logging
    logger.debug('Owner Check Details:', {
        senderId,
        senderPhone,
        normalizedSender,
        configOwner: config.OWNER_NUMBER,
        normalizedOwner,
        comparisons: {
            exactMatch: comparisons[0],
            directMatch: comparisons[1],
            rawMatch: comparisons[2],
            jidMatch: comparisons[3],
            endsWithMatch: comparisons[4],
            last10Match: comparisons[5]
        },
        result: isOwnerResult
    });
    
    return isOwnerResult;
}

/**
 * Enhanced admin checking with multiple validation methods
 */
export function isAdmin(senderId) {
    // Owner is always admin
    if (isOwner(senderId)) return true;
    
    if (!config.ADMIN_NUMBERS || config.ADMIN_NUMBERS.length === 0) {
        logger.debug('No ADMIN_NUMBERS configured');
        return false;
    }
    
    // Extract phone number from sender ID
    const senderPhone = extractPhoneFromJid(senderId);
    const normalizedSender = normalizePhoneNumber(senderPhone);
    
    // Check against all admin numbers
    const adminCheck = config.ADMIN_NUMBERS.some(adminNum => {
        const normalizedAdmin = normalizePhoneNumber(adminNum);
        
        const comparisons = [
            // Exact normalized match
            normalizedSender === normalizedAdmin,
            
            // Direct phone match
            senderPhone === normalizedAdmin,
            
            // Raw comparison
            normalizePhoneNumber(senderId) === normalizedAdmin,
            
            // JID comparison
            senderId === createJid(adminNum),
            
            // Check last 10 digits match
            normalizedSender.slice(-10) === normalizedAdmin.slice(-10)
        ];
        
        const matches = comparisons.some(Boolean);
        
        logger.debug(`Admin Check - ${adminNum}:`, {
            adminNum,
            normalizedAdmin,
            senderPhone,
            normalizedSender,
            matches,
            comparisons
        });
        
        return matches;
    });
    
    logger.debug('Final Admin Check Result:', { senderId, isAdmin: adminCheck });
    return adminCheck;
}

/**
 * Check if user is a group admin (WhatsApp group admin, not bot admin)
 */
export async function isGroupAdmin(sock, groupId, userId) {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const participant = groupMetadata.participants.find(p => p.id === userId);
        return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
    } catch (error) {
        logger.error('Error checking group admin status:', error);
        return false;
    }
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
 * Debug function to check user permissions - Enhanced
 */
export function debugUserPermissions(senderId) {
    console.log('\n=== PERMISSION DEBUG ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Sender ID:', senderId);
    console.log('Sender Type:', typeof senderId);
    
    const senderPhone = extractPhoneFromJid(senderId);
    const normalizedSender = normalizePhoneNumber(senderPhone);
    
    console.log('\n--- SENDER ANALYSIS ---');
    console.log('Extracted Phone:', senderPhone);
    console.log('Normalized Sender:', normalizedSender);
    
    console.log('\n--- OWNER CONFIG ---');
    console.log('Owner Number Config:', config.OWNER_NUMBER);
    console.log('Owner Type:', typeof config.OWNER_NUMBER);
    console.log('Normalized Owner:', normalizePhoneNumber(config.OWNER_NUMBER));
    
    console.log('\n--- ADMIN CONFIG ---');
    console.log('Admin Numbers Config:', config.ADMIN_NUMBERS);
    console.log('Admin Count:', config.ADMIN_NUMBERS?.length || 0);
    console.log('Normalized Admins:', config.ADMIN_NUMBERS?.map(num => ({
        original: num,
        normalized: normalizePhoneNumber(num)
    })));
    
    console.log('\n--- PERMISSION RESULTS ---');
    const ownerResult = isOwner(senderId);
    const adminResult = isAdmin(senderId);
    
    console.log('Is Owner:', ownerResult);
    console.log('Is Admin:', adminResult);
    
    console.log('\n--- RECOMMENDATIONS ---');
    if (!ownerResult && !adminResult) {
        console.log('❌ No permissions detected');
        console.log('💡 Try adding this to your .env:');
        console.log(`OWNER_NUMBER=${normalizedSender}`);
        console.log('or');
        console.log(`ADMIN_NUMBERS=${config.ADMIN_NUMBERS ? config.ADMIN_NUMBERS.join(',') + ',' : ''}${normalizedSender}`);
    } else {
        console.log('✅ Permissions working correctly');
    }
    
    console.log('========================\n');
}

/**
 * Validate user permissions and provide helpful feedback
 */
export function validateUserPermissions(senderId) {
    const senderPhone = extractPhoneFromJid(senderId);
    const normalizedSender = normalizePhoneNumber(senderPhone);
    
    return {
        senderId,
        senderPhone,
        normalizedSender,
        isOwner: isOwner(senderId),
        isAdmin: isAdmin(senderId),
        suggestions: {
            forOwner: `OWNER_NUMBER=${normalizedSender}`,
            forAdmin: `ADMIN_NUMBERS=${normalizedSender}`,
            currentOwner: config.OWNER_NUMBER,
            currentAdmins: config.ADMIN_NUMBERS
        }
    };
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
 * Get user display name from message
 */
export function getUserDisplayName(message) {
    return message.pushName || message.verifiedBizName || 'Unknown User';
}

/**
 * Check if number is valid WhatsApp format
 */
export function isValidWhatsAppNumber(number) {
    const normalized = normalizePhoneNumber(number);
    return normalized.length >= 10 && normalized.length <= 15 && /^\d+$/.test(normalized);
}

/**
 * Create mention array from user IDs
 */
export function createMentions(userIds) {
    if (!Array.isArray(userIds)) {
        userIds = [userIds];
    }
    return userIds.filter(id => id && typeof id === 'string');
}

/**
 * Escape markdown characters
 */
export function escapeMarkdown(text) {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\
/**
 * Clean up rate limit map periodically
 */
setInterval(() => {
    const now = Date.now();
    const windowStart = now - 60000;
    
    for (const [userId, requests] of rateLimitMap.entries()) {');
}
