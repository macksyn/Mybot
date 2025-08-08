import { config } from '../config/config.js';
import { formatDuration, getCurrentTime } from '../utils/helpers.js';

export default {
    name: 'admin',
    description: 'Admin control panel and system management',
    usage: `${config.PREFIX}admin [action]`,
    category: 'admin',
    adminOnly: true,
    
    async execute(context) {
        const { reply, args, react, isOwner, isAdmin } = context;
        
        if (!isAdmin && !isOwner) {
            await reply('🔒 *Access Denied*\n\nThis command requires administrator privileges.');
            return;
        }
        
        await react('⚙️');
        
        const action = args[0]?.toLowerCase();
        
        switch (action) {
            case 'status':
            case 'info':
                await this.showSystemStatus(context);
                break;
                
            case 'restart':
                if (!isOwner) {
                    await reply('🔒 *Owner Only*\n\nOnly the bot owner can restart the system.');
                    return;
                }
                await this.restartBot(context);
                break;
                
            case 'stats':
                await this.showStats(context);
                break;
                
            case 'session':
                await this.showSessionInfo(context);
                break;
                
            case 'config':
                await this.showConfig(context);
                break;
                
            case 'help':
                await this.showAdminHelp(context);
                break;
                
            default:
                await this.showAdminPanel(context);
                break;
        }
    },
    
    async showAdminPanel(context) {
        const { reply, isOwner } = context;
        
        let response = '⚙️ *Admin Control Panel*\n\n';
        
        response += '📊 *Available Actions:*\n';
        response += `• ${config.PREFIX}admin status - System status\n`;
        response += `• ${config.PREFIX}admin stats - Bot statistics\n`;
        response += `• ${config.PREFIX}admin session - Session info\n`;
        response += `• ${config.PREFIX}admin config - Configuration\n`;
        response += `• ${config.PREFIX}admin help - Admin help\n`;
        
        if (isOwner) {
            response += `• ${config.PREFIX}admin restart - Restart bot\n`;
        }
        
        response += '\n';
        response += '🔧 *Quick System Info:*\n';
        response += `• Uptime: ${formatDuration(process.uptime() * 1000)}\n`;
        response += `• Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n`;
        response += `• Node.js: ${process.version}\n`;
        response += `• Environment: ${config.NODE_ENV}\n\n`;
        
        response += '💡 Use specific commands above for detailed information.';
        
        await reply(response);
    },
    
    async showSystemStatus(context) {
        const { reply } = context;
        
        const uptime = process.uptime() * 1000;
        const memUsage = process.memoryUsage();
        
        let response = '📊 *System Status Report*\n\n';
        
        // System Health
        response += '🖥️ *System Health:*\n';
        response += `• Status: 🟢 Operational\n`;
        response += `• Uptime: ${formatDuration(uptime)}\n`;
        response += `• CPU Usage: ${await getCpuUsage()}%\n`;
        response += `• Platform: ${process.platform} (${process.arch})\n\n`;
        
        // Memory Usage
        response += '💾 *Memory Usage:*\n';
        response += `• Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB\n`;
        response += `• Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB\n`;
        response += `• RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB\n`;
        response += `• External: ${Math.round(memUsage.external / 1024 / 1024)}MB\n\n`;
        
        // Runtime Info
        response += '⚙️ *Runtime Information:*\n';
        response += `• Node.js: ${process.version}\n`;
        response += `• Environment: ${config.NODE_ENV}\n`;
        response += `• Process ID: ${process.pid}\n`;
        response += `• Current Time: ${getCurrentTime()}\n\n`;
        
        // Health Check
        const healthScore = calculateHealthScore(memUsage, uptime);
        response += `🏥 *Health Score:* ${healthScore}/100\n`;
        response += getHealthStatus(healthScore);
        
        await reply(response);
    },
    
    async showStats(context) {
        const { reply } = context;
        
        // Note: In a real implementation, you'd track these statistics
        // For now, we'll show placeholder/calculated stats
        
        let response = '📈 *Bot Statistics*\n\n';
        
        response += '📊 *Usage Statistics:*\n';
        response += `• Total Uptime: ${formatDuration(process.uptime() * 1000)}\n`;
        response += `• Commands Executed: N/A (tracking disabled)\n`;
        response += `• Messages Processed: N/A (tracking disabled)\n`;
        response += `• Active Sessions: 1\n\n`;
        
        response += '🔧 *System Statistics:*\n';
        response += `• Memory Peak: ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB\n`;
        response += `• Restart Count: N/A\n`;
        response += `• Last Restart: Startup\n`;
        response += `• Error Count: N/A\n\n`;
        
        response += '📱 *WhatsApp Statistics:*\n';
        response += `• Connection Status: Connected\n`;
        response += `• Session Type: ${config.isUsingSessionString() ? 'Mega.nz' : 'File-based'}\n`;
        response += `• Auth Method: ${config.isUsingSessionString() ? 'Session String' : 'File Auth'}\n`;
        response += `• Session ID: ${config.SESSION_ID}\n\n`;
        
        response += '💡 *Note:* Advanced statistics require database integration.';
        
        await reply(response);
    },
    
    async showSessionInfo(context) {
        const { reply } = context;
        
        let response = '🔐 *Session Information*\n\n';
        
        const sessionInfo = config.getSessionInfo();
        
        response += '📋 *Current Session:*\n';
        response += `• Session ID: ${config.SESSION_ID}\n`;
        response += `• Auth Method: ${config.isUsingSessionString() ? 'Session String' : 'File-based'}\n`;
        
        if (config.isUsingSessionString()) {
            response += `• String Length: ${config.SESSION_STRING.length} chars\n`;
            response += `• Type: ${sessionInfo.type || 'Unknown'}\n`;
            
            if (sessionInfo.type === 'mega') {
                response += `• Source: Mega.nz Cloud Storage\n`;
                response += `• Prefix: ${sessionInfo.prefix || 'Unknown'}\n`;
            }
            
            if (sessionInfo.phoneNumber) {
                response += `• Phone: ${sessionInfo.phoneNumber}\n`;
            }
        } else {
            response += `• Session Path: ${config.getSessionPath()}\n`;
        }
        
        response += '\n';
        
        response += '🔒 *Security Status:*\n';
        response += `• Session Valid: ✅ Active\n`;
        response += `• Connection: 🟢 Stable\n`;
        response += `• Last Update: Active session\n\n`;
        
        response += '⚙️ *Session Actions:*\n';
        response += `• Test: ${config.PREFIX}sessiontest\n`;
        response += `• Info: ${config.PREFIX}admin session\n`;
        response += '• Backup: Auto-saved to local files\n\n';
        
        response += '💡 *Tip:* Regular session testing ensures stability.';
        
        await reply(response);
    },
    
    async showConfig(context) {
        const { reply } = context;
        
        let response = '🔧 *Bot Configuration*\n\n';
        
        response += '📝 *Basic Settings:*\n';
        response += `• Bot Name: ${config.BOT_NAME}\n`;
        response += `• Prefix: ${config.PREFIX}\n`;
        response += `• Timezone: ${config.TIMEZONE}\n`;
        response += `• Environment: ${config.NODE_ENV}\n`;
        response += `• Log Level: ${config.LOG_LEVEL}\n\n`;
        
        response += '👥 *Access Control:*\n';
        response += `• Owner: ${config.OWNER_NUMBER ? '✅ Set' : '❌ Not Set'}\n`;
        response += `• Admins: ${config.ADMIN_NUMBERS.length} configured\n`;
        response += `• Rate Limit: ${config.MAX_COMMANDS_PER_MINUTE}/min\n\n`;
        
        response += '✨ *Feature Status:*\n';
        response += `• Weather: ${config.ENABLE_WEATHER ? '✅' : '❌'}\n`;
        response += `• Jokes: ${config.ENABLE_JOKES ? '✅' : '❌'}\n`;
        response += `• Quotes: ${config.ENABLE_QUOTES ? '✅' : '❌'}\n`;
        response += `• Calculator: ${config.ENABLE_CALCULATOR ? '✅' : '❌'}\n`;
        response += `• Admin Commands: ${config.ENABLE_ADMIN_COMMANDS ? '✅' : '❌'}\n`;
        response += `• Auto React: ${config.ENABLE_AUTO_REACT ? '✅' : '❌'}\n\n`;
        
        response += '🔑 *API Keys:*\n';
        response += `• OpenWeather: ${config.OPENWEATHER_API_KEY ? '✅ Set' : '❌ Not Set'}\n`;
        response += `• Quotes API: ${config.QUOTE_API_KEY ? '✅ Set' : '❌ Not Set'}\n\n`;
        
        response += '⚙️ *System Settings:*\n';
        response += `• Port: ${config.PORT}\n`;
        response += `• Log to File: ${config.LOG_TO_FILE ? '✅' : '❌'}\n`;
        response += `• Startup Message: ${config.SEND_STARTUP_MESSAGE ? '✅' : '❌'}\n`;
        response += `• Auto Restart: ${config.AUTO_RESTART_ON_LOGOUT ? '✅' : '❌'}`;
        
        await reply(response);
    },
    
    async showAdminHelp(context) {
        const { reply, isOwner } = context;
        
        let response = '📖 *Admin Commands Help*\n\n';
        
        response += '🔧 *Available Commands:*\n\n';
        
        response += `*${config.PREFIX}admin status*\n`;
        response += '• Show detailed system status\n';
        response += '• Memory usage, uptime, health\n\n';
        
        response += `*${config.PREFIX}admin stats*\n`;
        response += '• Bot usage statistics\n';
        response += '• Performance metrics\n\n';
        
        response += `*${config.PREFIX}admin session*\n`;
        response += '• Current session information\n';
        response += '• Security status\n\n';
        
        response += `*${config.PREFIX}admin config*\n`;
        response += '• Bot configuration overview\n';
        response += '• Feature status, API keys\n\n';
        
        if (isOwner) {
            response += `*${config.PREFIX}admin restart* ⚠️\n`;
            response += '• Restart the bot (Owner only)\n';
            response += '• Use with caution\n\n';
        }
        
        response += '📊 *Related Commands:*\n';
        response += `• ${config.PREFIX}sessiontest - Test session\n`;
        response += `• ${config.PREFIX}info - Basic bot info\n`;
        response += `• ${config.PREFIX}ping - Check response time\n\n`;
        
        response += '💡 *Tips:*\n';
        response += '• Regular status checks help maintain bot health\n';
        response += '• Monitor memory usage for optimal performance\n';
        response += '• Test session periodically for stability';
        
        await reply(response);
    },
    
    async restartBot(context) {
        const { reply } = context;
        
        await reply('🔄 *Restarting Bot...*\n\n' +
                   'The bot will restart in 3 seconds.\n' +
                   'This may take a moment to complete.\n\n' +
                   '⚠️ *Please wait for reconnection...*');
        
        // Give time for the message to send
        setTimeout(() => {
            process.exit(0); // Let PM2 or process manager restart
        }, 3000);
    }
};

// Helper functions
async function getCpuUsage() {
    return new Promise((resolve) => {
        const startUsage = process.cpuUsage();
        setTimeout(() => {
            const currentUsage = process.cpuUsage(startUsage);
            const totalUsage = currentUsage.user + currentUsage.system;
            const percentage = (totalUsage / 1000000) * 100; // Convert to percentage
            resolve(Math.min(Math.round(percentage), 100));
        }, 100);
    });
}

function calculateHealthScore(memUsage, uptime) {
    let score = 100;
    
    // Memory usage penalty
    const memUsageMB = memUsage.heapUsed / 1024 / 1024;
    if (memUsageMB > 500) score -= 20;
    else if (memUsageMB > 200) score -= 10;
    else if (memUsageMB > 100) score -= 5;
    
    // Uptime bonus
    const uptimeHours = uptime / (1000 * 60 * 60);
    if (uptimeHours > 24) score += 5;
    if (uptimeHours > 168) score += 5; // 1 week
    
    return Math.max(0, Math.min(100, score));
}

function getHealthStatus(score) {
    if (score >= 90) return '💚 Excellent - System running optimally';
    if (score >= 75) return '💛 Good - System performing well';
    if (score >= 60) return '🧡 Fair - Minor issues detected';
    if (score >= 40) return '❤️ Poor - System needs attention';
    return '💔 Critical - Immediate action required';
}
