import { isAdmin, isOwner, extractPhoneFromJid, normalizePhoneNumber, debugUserPermissions } from '../utils/helpers.js';
import { config } from '../config/config.js';

export default {
    name: 'debug',
    description: 'Debug user permissions and bot configuration',
    usage: '!debug [permissions|config|me]',
    category: 'debug',
    
    async execute(context) {
        const { reply, args, senderId, message } = context;
        
        if (args.length === 0) {
            await this.showDebugMenu(reply, senderId);
            return;
        }
        
        const subcommand = args[0].toLowerCase();
        
        switch (subcommand) {
            case 'permissions':
            case 'perms':
                await this.debugPermissions(reply, senderId);
                break;
            case 'config':
                await this.debugConfig(reply, senderId);
                break;
            case 'me':
                await this.debugUser(reply, senderId, message);
                break;
            default:
                await reply(`❌ Unknown debug command: *${subcommand}*\n\nUse *${config.PREFIX}debug* to see available options.`);
        }
    },
    
    async showDebugMenu(reply, senderId) {
        const isOwnerUser = isOwner(senderId);
        const isAdminUser = isAdmin(senderId);
        
        const debugText = `🔍 *Debug Menu*\n\n` +
                         `👤 *Your Status:*\n` +
                         `• Owner: ${isOwnerUser ? '✅' : '❌'}\n` +
                         `• Admin: ${isAdminUser ? '✅' : '❌'}\n\n` +
                         `📋 *Available Commands:*\n\n` +
                         `• *permissions* - Check permission details\n` +
                         `• *config* - Show configuration ${isOwnerUser ? '' : '(owner only)'}\n` +
                         `• *me* - Show your user details\n\n` +
                         `💡 *Usage:* ${config.PREFIX}debug [command]`;
        
        await reply(debugText);
    },
    
    async debugPermissions(reply, senderId) {
        // Extract and normalize phone numbers
        const senderPhone = extractPhoneFromJid(senderId);
        const normalizedSender = normalizePhoneNumber(senderPhone);
        const normalizedOwner = normalizePhoneNumber(config.OWNER_NUMBER);
        
        // Permission checks
        const isOwnerUser = isOwner(senderId);
        const isAdminUser = isAdmin(senderId);
        
        // Admin number checks
        let adminMatches = [];
        if (config.ADMIN_NUMBERS && config.ADMIN_NUMBERS.length > 0) {
            adminMatches = config.ADMIN_NUMBERS.map(adminNum => {
                const normalizedAdmin = normalizePhoneNumber(adminNum);
                return {
                    original: adminNum,
                    normalized: normalizedAdmin,
                    matches: normalizedAdmin === normalizedSender
                };
            });
        }
        
        const debugText = `🔍 *Permission Debug*\n\n` +
                         `👤 *Your Details:*\n` +
                         `• Sender ID: \`${senderId}\`\n` +
                         `• Phone: \`${senderPhone}\`\n` +
                         `• Normalized: \`${normalizedSender}\`\n\n` +
                         `👑 *Owner Check:*\n` +
                         `• Config Owner: \`${config.OWNER_NUMBER}\`\n` +
                         `• Normalized: \`${normalizedOwner}\`\n` +
                         `• Is Owner: ${isOwnerUser ? '✅' : '❌'}\n` +
                         `• Match: ${normalizedOwner === normalizedSender ? '✅' : '❌'}\n\n` +
                         `👥 *Admin Check:*\n` +
                         `• Is Admin: ${isAdminUser ? '✅' : '❌'}\n` +
                         `• Admin Count: ${config.ADMIN_NUMBERS.length}\n` +
                         (adminMatches.length > 0 ? 
                            adminMatches.map((admin, i) => 
                                `• Admin ${i + 1}: \`${admin.original}\` → \`${admin.normalized}\` ${admin.matches ? '✅' : '❌'}`
                            ).join('\n') + '\n\n' : 
                            '• No admin numbers configured\n\n'
                         ) +
                         `🔧 *Recommendations:*\n` +
                         (!isOwnerUser && !isAdminUser ? 
                            `• Add your number to ADMIN_NUMBERS or set as OWNER_NUMBER\n` +
                            `• Use format: ${normalizedSender}\n` : 
                            `• Permissions are working correctly! ✅\n`);
        
        // Log to console for debugging
        debugUserPermissions(senderId);
        
        await reply(debugText);
    },
    
    async debugConfig(reply, senderId) {
        // Only owner can see full config
        if (!isOwner(senderId)) {
            await reply('❌ Only the bot owner can view configuration details.');
            return;
        }
        
        const configText = `⚙️ *Bot Configuration*\n\n` +
                          `🤖 *Basic Settings:*\n` +
                          `• Name: ${config.BOT_NAME}\n` +
                          `• Prefix: \`${config.PREFIX}\`\n` +
                          `• Environment: ${config.NODE_ENV}\n` +
                          `• Timezone: ${config.TIMEZONE}\n\n` +
                          `👤 *Security:*\n` +
                          `• Owner: \`${config.OWNER_NUMBER}\`\n` +
                          `• Admins: \`${config.ADMIN_NUMBERS.join(', ')}\`\n` +
                          `• Rate Limit: ${config.MAX_COMMANDS_PER_MINUTE}/min\n\n` +
                          `🔧 *Features:*\n` +
                          `• Admin Commands: ${config.ENABLE_ADMIN_COMMANDS ? '✅' : '❌'}\n` +
                          `• Weather: ${config.ENABLE_WEATHER ? '✅' : '❌'}\n` +
                          `• Jokes: ${config.ENABLE_JOKES ? '✅' : '❌'}\n` +
                          `• Quotes: ${config.ENABLE_QUOTES ? '✅' : '❌'}\n` +
                          `• Calculator: ${config.ENABLE_CALCULATOR ? '✅' : '❌'}\n` +
                          `• Economy: ${config.ENABLE_ECONOMY ? '✅' : '❌'}\n` +
                          `• Attendance: ${config.ENABLE_ATTENDANCE ? '✅' : '❌'}\n\n` +
                          `📱 *Connection:*\n` +
                          `• Pairing Code: ${config.USE_PAIRING_CODE ? '✅' : '❌'}\n` +
                          `• Startup Message: ${config.SEND_STARTUP_MESSAGE ? '✅' : '❌'}\n` +
                          `• Auto Restart: ${config.AUTO_RESTART_ON_LOGOUT ? '✅' : '❌'}`;
        
        await reply(configText);
    },
    
    async debugUser(reply, senderId, message) {
        const senderPhone = extractPhoneFromJid(senderId);
        const normalizedSender = normalizePhoneNumber(senderPhone);
        const isOwnerUser = isOwner(senderId);
        const isAdminUser = isAdmin(senderId);
        const isGroup = message.key.remoteJid?.endsWith('@g.us');
        
        const userText = `👤 *Your Information*\n\n` +
                        `📱 *Identity:*\n` +
                        `• Sender ID: \`${senderId}\`\n` +
                        `• Phone Number: \`${senderPhone}\`\n` +
                        `• Normalized: \`${normalizedSender}\`\n` +
                        `• Chat Type: ${isGroup ? 'Group' : 'Private'}\n\n` +
                        `🔐 *Permissions:*\n` +
                        `• Owner Status: ${isOwnerUser ? '✅ Yes' : '❌ No'}\n` +
                        `• Admin Status: ${isAdminUser ? '✅ Yes' : '❌ No'}\n\n` +
                        `💡 *Quick Fix:*\n` +
                        `If you should have admin access, ask the bot owner to:\n` +
                        `1. Add \`${normalizedSender}\` to ADMIN_NUMBERS in .env\n` +
                        `2. Or set OWNER_NUMBER=\`${normalizedSender}\` in .env\n` +
                        `3. Restart the bot`;
        
        await reply(userText);
    }
};
