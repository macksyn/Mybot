export default {
    name: 'ping',
    description: 'Check bot response time and status',
    usage: '!ping',
    category: 'utility',
    
    async execute(context) {
        const { reply, react } = context;
        
        const startTime = Date.now();
        await react('🏓');
        
        const responseTime = Date.now() - startTime;
        const uptime = process.uptime();
        
        // Format uptime
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        
        const uptimeString = days > 0 
            ? `${days}d ${hours}h ${minutes}m ${seconds}s`
            : hours > 0 
                ? `${hours}h ${minutes}m ${seconds}s`
                : minutes > 0 
                    ? `${minutes}m ${seconds}s`
                    : `${seconds}s`;
        
        const responseText = `🏓 *Pong!*\n\n` +
                           `⚡ Response Time: ${responseTime}ms\n` +
                           `⏱️ Uptime: ${uptimeString}\n` +
                           `💾 Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n` +
                           `🟢 Status: Online`;
        
        await reply(responseText);
    }
};