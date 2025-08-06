#!/usr/bin/env node
import './config';
import http from 'http';
import { createBot } from './client.js';
import { logger } from './utils/logger.js';
import { config } from './config/config.js';

// Health check server
const PORT = process.env.PORT || 8000;
let botStatus = 'starting';
let startTime = Date.now();

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
            message: `${config.BOT_NAME} Health Check`,
            uptime: `${uptime}s`,
            timestamp: new Date().toISOString(),
            environment: config.NODE_ENV,
            prefix: config.PREFIX
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthData, null, 2));
    } else if (req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('pong');
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

// Start health check server
server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Health check server running on port ${PORT}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    botStatus = 'error';
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    botStatus = 'error';
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    botStatus = 'shutting_down';
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    botStatus = 'shutting_down';
    server.close(() => {
        process.exit(0);
    });
});

async function startBot() {
    try {
        logger.info(`Starting ${config.BOT_NAME}...`);
        logger.info(`Environment: ${config.NODE_ENV}`);
        logger.info(`Prefix: ${config.PREFIX}`);
        
        botStatus = 'connecting';
        const bot = await createBot();
        botStatus = 'running';
        
        // Keep the process alive
        process.stdin.resume();
        
        logger.info('Bot started successfully! 🚀');
        logger.info(`Health check available at: http://localhost:${PORT}/health`);
        
    } catch (error) {
        logger.error('Failed to start bot:', error);
        botStatus = 'error';
        process.exit(1);
    }
}

// Start the bot
startBot();
