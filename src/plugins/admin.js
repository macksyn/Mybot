import { isAdmin, isOwner, formatFileSize } from '../utils/helpers.js';
import { config } from '../config/config.js';

export default {
    name: 'admin',
    description: 'Admin commands for bot management',
    usage: '!admin [subcommand]',
    category: 'admin',
    
    async execute(context) {
        const { reply, args, senderId, sock } = context;
        
        // Check if user is admin or owner
        if (!isAdmin(senderId) && !isOwner(senderId)) {
            await reply('❌ You do not have permission to use admin commands.');
            return;
        }
        
        if (args.length === 0) {
            await this.showAdminMenu(reply);
            return;
        }
        
        const subcommand = args[0].toLowerCase();
        const subArgs = args.slice(1);
        
        switch (subcommand) {
            case 'status':
                await this.showStatus(reply);
                break;
            case 'restart':
                await this.restart(reply, senderId);
                break;
            case 'broadcast':
                await this.broadcast(reply, subArgs, sock, senderId);
                break;
            case 'stats':
                await this.showStats(reply);
                break;
            case 'help':
                await this.showAdminMenu(reply);
                break;
            default:
                await reply(`❌ Unknown admin command: *${subcommand}*\n\nUse *${config.PREFIX}admin help* to see available commands.`);
        }
    },
    
    async showAdminMenu(reply) {
        const adminText = `⚙️ *Admin Panel*\n\n` +
                         `📋 *Available Commands:*\n\n` +
                         `• *status* - Show bot status\n` +
                         `• *stats* - Show detailed statistics\n` +
                         `• *restart* - Restart the bot\n` +
                         `• *broadcast [message]* - Send message to all chats\n` +
                         `• *help* - Show this menu\n\n` +
                         `💡 *Usage:* ${config.PREFIX}admin [command]`;
        
        await reply(adminText);
    },
    
    async showStatus(reply) {
        const uptime = process.uptime();
        const memory = process.memoryUsage();
        
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        
        const statusText = `📊 *Bot Status*\n\n` +
                          `🟢 *Status:* Online\n` +
                          `⏱️ *Uptime:* ${days}d ${hours}h ${minutes}m ${seconds}s\n` +
                          `💾 *Memory:* ${formatFileSize(memory.heapUsed)} / ${formatFileSize(memory.heapTotal)}\n` +
                          `🔄 *Node.js:* ${process.version}\n` +
                          `🌐 *Platform:* ${process.platform}\n` +
                          `📅 *Started:* ${new Date(Date.now() - uptime * 1000).toLocaleString()}`;
        
        await reply(statusText);
    },
    
    async showStats(reply) {
        const stats = {
            totalMemory: formatFileSize(process.memoryUsage().heapTotal),
            usedMemory: formatFileSize(process.memoryUsage().heapUsed),
            freeMemory: formatFileSize(process.memoryUsage().heapTotal - process.memoryUsage().heapUsed),
            uptime: Math.floor(process.uptime()),
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
        };
        
        const statsText = `📊 *Detailed Statistics*\n\n` +
                         `💾 *Memory Usage:*\n` +
                         `• Total: ${stats.totalMemory}\n` +
                         `• Used: ${stats.usedMemory}\n` +
                         `• Free: ${stats.freeMemory}\n\n` +
                         `⚙️ *System Info:*\n` +
                         `• Node.js: ${stats.nodeVersion}\n` +
                         `• Platform: ${stats.platform}\n` +
                         `• Architecture: ${stats.arch}\n` +
                         `• Uptime: ${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m\n\n` +
                         `🔧 *Configuration:*\n` +
                         `• Prefix: ${config.PREFIX}\n` +
                         `• Environment: ${config.NODE_ENV}\n` +
                         `• Rate Limit: ${config.MAX_COMMANDS_PER_MINUTE}/min`;
        
        await reply(statsText);
    },
    
    async restart(reply, senderId) {
        // Only owner can restart
        if (!isOwner(senderId)) {
            await reply('❌ Only the bot owner can restart the bot.');
            return;
        }
        
        await reply('🔄 Restarting bot... Please wait.');
        
        // Give time for message to send
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    },
    
    async broadcast(reply, args, sock, senderId) {
        // Only owner can broadcast
        if (!isOwner(senderId)) {
            await reply('❌ Only the bot owner can send broadcasts.');
            return;
        }
        
        if (args.length === 0) {
            await reply(`❓ Please provide a message to broadcast.\n\nExample: *${config.PREFIX}admin broadcast Hello everyone!*`);
            return;
        }
        
        const message = args.join(' ');
        
        try {
            // This is a simplified broadcast - in a real implementation,
            // you would maintain a list of chats/groups to broadcast to
            await reply(`📢 *Broadcast Message:*\n\n${message}\n\n⚠️ *Note:* Broadcast functionality needs to be implemented with a proper chat management system.`);
            
        } catch (error) {
            await reply('❌ Error sending broadcast message.');
        }
    }
};