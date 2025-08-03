import moment from 'moment';
import { config } from '../config/config.js';

// In src/utils/helpers.js
export function formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

// Make sure to export other functions you need as well

// Rate limiting storage
const rateLimitMap = new Map();

// Delay function (like the working implementation)
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function parseCommand(messageText) {
    if (!messageText.startsWith(config.PREFIX)) return null;
    
    const args = messageText.slice(config.PREFIX.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();
    
    if (!command) return null;
    
    return { command, args };
}

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

export function getMessageContent(message) {
    // Handle different message types
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;
    if (message.documentMessage?.caption) return message.documentMessage.caption;
    
    return null;
}

export function getSenderId(message) {
    return message.key.fromMe ? 'me' : (message.key.participant || message.key.remoteJid);
}

export function isOwner(senderId) {
    if (!config.OWNER_NUMBER) return false;
    
    const ownerJid = config.OWNER_NUMBER.replace(/\D/g, '') + '@s.whatsapp.net';
    return senderId === ownerJid || senderId === config.OWNER_NUMBER.replace(/\D/g, '');
}

export function isAdmin(senderId) {
    if (isOwner(senderId)) return true;
    
    const cleanSenderId = senderId.replace(/\D/g, '');
    return config.ADMIN_NUMBERS.some(adminNum => {
        const cleanAdminNum = adminNum.replace(/\D/g, '');
        return cleanSenderId === cleanAdminNum;
    });
}

export function formatPhoneNumber(number) {
    // Remove all non-digits
    const cleaned = number.replace(/\D/g, '');
    
    // Add country code if missing (assuming it's a 10-digit number without country code)
    if (cleaned.length === 10) {
        return '1' + cleaned; // Add US country code as default
    }
    
    return cleaned;
}

export function createJid(number) {
    const cleaned = number.replace(/\D/g, '');
    return cleaned + '@s.whatsapp.net';
}

export function extractNumber(jid) {
    return jid.split('@')[0];
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
