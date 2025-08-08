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
        response += `• Auth Method: ${config.isUsingSessionString() ? 'Session String' :
