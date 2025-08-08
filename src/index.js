#!/usr/bin/env node
import 'dotenv/config';
import http from 'http';
import { createBot } from './client.js';
import { logger } from './utils/logger.js';
import { config } from './config/config.js';

// Health check server
const PORT = process.env.PORT || 8000;
let botStatus = 'starting';
let startTime = Date.now();
let botInstance = null;

const server = http.createServer((req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (req.url === '/' || req.url === '/health') {
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const healthData = {
            status: botStatus,
            botName: config.BOT_NAME,
            uptime: `${uptime}s`,
            timestamp: new Date().toISOString(),
            environment: config.NODE_ENV,
            prefix: config.PREFIX,
            sessionType: config.isUsingSessionString() ? 'Mega.nz Session' : 'File-based',
            version: '2.0.0'
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthData, null, 2));
    } else if (req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('pong');
    } else if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: botStatus, uptime: Date.now() - startTime }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

// Start health check server
server.listen(PORT, '0.0.0.0', () => {
    logger.info(`🌐 Health check server running on port ${PORT}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught Exception:', error);
    botStatus = 'error';
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    botStatus = 'error';
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('🛑 Received SIGINT, shutting down gracefully...');
    botStatus = 'shutting_down';
    
    if (botInstance && botInstance.end) {
        botInstance.end();
    }
    
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    logger.info('🛑 Received SIGTERM, shutting down gracefully...');
    botStatus = 'shutting_down';
    
    if (botInstance && botInstance.end) {
        botInstance.end();
    }
    
    server.close(() => {
        process.exit(0);
    });
});

async function startBot() {
    try {
        logger.info(`🚀 Starting ${config.BOT_NAME}...`);
        logger.info(`🌍 Environment: ${config.NODE_ENV}`);
        logger.info(`⚡ Prefix: ${config.PREFIX}`);
        logger.info(`📝 Session Method: ${config.isUsingSessionString() ? 'Mega.nz Session' : 'File-based'}`);
        logger.info(`🕐 Timezone: ${config.TIMEZONE}`);
        
        // Show session info
        if (config.isUsingSessionString()) {
            const sessionInfo = config.getSessionInfo();
            if (sessionInfo.type === 'mega') {
                logger.info('🔗 Mega.nz session detected - will download on first connection');
                logger.info(`📂 Session prefix: ${sessionInfo.prefix || 'Unknown'}`);
            }
        }
        
        botStatus = 'connecting';
        botInstance = await createBot();
        botStatus = 'running';
        
        // Keep the process alive
        process.stdin.resume();
        
        logger.info('✅ Bot started successfully! 🎉');
        logger.info(`📊 Health check available at: http://localhost:${PORT}/health`);
        logger.info(`📝 Use ${config.PREFIX}help to see available commands`);
        
    } catch (error) {
        logger.error('❌ Failed to start bot:', error);
        botStatus = 'error';
        
        // Provide helpful error guidance
        if (error.message.includes('Session')) {
            logger.error('');
            logger.error('🔧 Session Issues - Troubleshooting:');
            logger.error('   1. Check your SESSION_STRING in .env file');
            logger.error('   2. Ensure Mega.nz link format: prefix~fileId#key');
            logger.error('   3. Verify Mega.nz file is accessible');
            logger.error('   4. Run: npm run test:session to validate');
            logger.error('   5. Generate a new session if needed');
        } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
            logger.error('');
            logger.error('🌐 Network Issues:');
            logger.error('   1. Check internet connection');
            logger.error('   2. Verify firewall settings');
            logger.error('   3. Check if Mega.nz is accessible');
        } else {
            logger.error('');
            logger.error('🔧 General troubleshooting:');
            logger.error('   1. Check all environment variables');
            logger.error('   2. Verify Node.js version (>=18)');
            logger.error('   3. Check logs for more details');
        }
        
        process.exit(1);
    }
}

// Banner
console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║          WhatsApp Bot with Mega.nz          ║');
console.log('║               Session Support               ║');
console.log('║                  v2.0.0                     ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');

// Start the bot
startBot();
