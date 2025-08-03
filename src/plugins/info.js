import { config } from '../config/config.js';
import { formatDuration } from '../utils/helpers.js';

export default {
    name: 'info',
    description: 'Show bot information and statistics',
    usage: '!info',
    category: 'utility',
    
    async execute(context) {
        const { reply, react } = context;
        
        await react('ℹ️');
        
        const uptime = Math.floor(process.uptime());
        const memoryUsage = process.memoryUsage();
        const nodeVersion = process.version;
        const platform = process.platform;
        const arch = process.arch;
        
        // Format memory usage
        const heapUsed = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        const heapTotal = Math.round(memoryUsage.heapTotal / 1024 / 1024);
        const external = Math.round(memoryUsage.external / 1024 / 1024);
        
        const infoText = `🤖 *${config.BOT_NAME} - Information*\n\n` +
                        `📊 *System Information:*\n` +
                        `• Node.js: ${nodeVersion}\n` +
                        `• Platform: ${platform} (${arch})\n` +
                        `• Environment: ${config.NODE_ENV}\n` +
                        `• Uptime: ${formatDuration(uptime)}\n\n` +
                        
                        `💾 *Memory Usage:*\n` +
                        `• Heap Used: ${heapUsed}MB\n` +
                        `• Heap Total: ${heapTotal}MB\n` +
                        `• External: ${external}MB\n\n` +
                        
                        `⚙️ *Bot Configuration:*\n` +
                        `• Prefix: ${config.PREFIX}\n` +
                        `• Timezone: ${config.TIMEZONE}\n` +
                        `• Rate Limit: ${config.MAX_COMMANDS_PER_MINUTE}/min\n\n` +
                        
                        `🔧 *Features:*\n` +
                        `• Weather: ${config.ENABLE_WEATHER ? '✅' : '❌'}\n` +
                        `• Jokes: ${config.ENABLE_JOKES ? '✅' : '❌'}\n` +
                        `• Quotes: ${config.ENABLE_QUOTES ? '✅' : '❌'}\n` +
                        `• Calculator: ${config.ENABLE_CALCULATOR ? '✅' : '❌'}\n` +
                        `• Admin Commands: ${config.ENABLE_ADMIN_COMMANDS ? '✅' : '❌'}\n\n` +
                        
                        `📅 *Started:* ${new Date(Date.now() - uptime * 1000).toLocaleString()}\n\n` +
                        
                        `💡 Use *${config.PREFIX}help* to see available commands.`;
        
        await reply(infoText);
    }
};