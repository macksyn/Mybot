import { isOwner, isAdmin, extractPhoneFromJid, normalizePhoneNumber, debugUserPermissions, validateUserPermissions } from '../utils/helpers.js';
import { config } from '../config/config.js';

export default {
    name: 'testperms',
    description: 'Test permission system and provide setup guidance',
    usage: '!testperms',
    category: 'debug',
    
    async execute(context) {
        const { reply, senderId } = context;
        
        // Get permission validation details
        const validation = validateUserPermissions(senderId);
        
        // Debug to console
        debugUserPermissions(senderId);
        
        const testResults = `🔍 *Permission Test Results*\n\n` +
                           `👤 *Your Identity:*\n` +
                           `• Sender ID: \`${validation.senderId}\`\n` +
                           `• Phone: \`${validation.senderPhone}\`\n` +
                           `• Normalized: \`${validation.normalizedSender}\`\n\n` +
                           `🔐 *Current Permissions:*\n` +
                           `• Owner: ${validation.isOwner ? '✅ YES' : '❌ NO'}\n` +
                           `• Admin: ${validation.isAdmin ? '✅ YES' : '❌ NO'}\n\n` +
                           `⚙️ *Current Config:*\n` +
                           `• Owner Number: \`${config.OWNER_NUMBER || 'Not set'}\`\n` +
                           `• Admin Numbers: \`${config.ADMIN_NUMBERS?.length ? config.ADMIN_NUMBERS.join(', ') : 'None'}\`\n\n` +
                           `${(!validation.isOwner && !validation.isAdmin) ? 
                             `🔧 *Setup Instructions:*\n\n` +
                             `*To make you the owner:*\n` +
                             `Add to .env: \`OWNER_NUMBER=${validation.normalizedSender}\`\n\n` +
                             `*To add you as admin:*\n` +
                             `Add to .env: \`ADMIN_NUMBERS=${validation.normalizedSender}\`\n\n` +
                             `*Current admin list + you:*\n` +
                             `\`ADMIN_NUMBERS=${config.ADMIN_NUMBERS?.length ? config.ADMIN_NUMBERS.join(',') + ',' : ''}${validation.normalizedSender}\`\n\n` +
                             `After updating .env, restart the bot.` :
                             `✅ *Permissions are working correctly!*\n\n` +
                             `You have the necessary permissions to use admin commands.`
                           }\n\n` +
                           `💡 *Debug info logged to console for troubleshooting.*`;
        
        await reply(testResults);
        
        // If user has permissions, show additional admin info
        if (validation.isOwner || validation.isAdmin) {
            setTimeout(async () => {
                const adminInfo = `🎉 *Admin Features Available:*\n\n` +
                                 `• \`${config.PREFIX}admin\` - Admin panel\n` +
                                 `• \`${config.PREFIX}debug\` - Debug tools\n` +
                                 `• \`${config.PREFIX}migrate\` - Data management ${validation.isOwner ? '' : '(owner only)'}\n` +
                                 `• \`${config.PREFIX}pair\` - Pairing management\n\n` +
                                 `${validation.isOwner ? '👑 You have full owner privileges!' : '👥 You have admin privileges!'}`;
                
                await reply(adminInfo);
            }, 2000);
        }
    }
};
