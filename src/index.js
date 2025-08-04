#!/usr/bin/env node
import 'dotenv/config';

// PostgreSQL diagnostic logging
console.log('🔍 POSTGRESQL DIAGNOSTIC:');
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('DATABASE_NAME:', process.env.DATABASE_NAME);
if (process.env.DATABASE_URL) {
    try {
        const url = new URL(process.env.DATABASE_URL);
        console.log('DATABASE_URL preview:', `${url.protocol}//${url.username}:***@${url.hostname}:${url.port}${url.pathname}`);
    } catch (error) {
        console.log('DATABASE_URL format error:', error.message);
    }
} else {
    console.log('Using individual PG_ variables');
}

import http from 'http';
import { createBot } from './client.js';
import { logger } from './utils/logger.js';
import { config } from './config/config.js';
import { db } from './database/postgresql.js';

// Health check server
const PORT = process.env.PORT || 8000;
let botStatus = 'starting';
let startTime = Date.now();

const server = http.createServer(async (req, res) => {
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
        
        // Get database stats if available
        let dbStats = { connected: false, users: 0, groups: 0, totalWealth: 0 };
        try {
            if (db && await db.healthCheck()) {
                dbStats = await db.getStats();
            }
        } catch (error) {
            // Ignore errors for health check
        }
        
        const healthData = {
            status: botStatus,
            message: `${config.BOT_NAME} Health Check`,
            uptime: `${uptime}s`,
            timestamp: new Date().toISOString(),
            environment: config.NODE_ENV,
            prefix: config.PREFIX,
            database: {
                type: 'PostgreSQL',
                connected: dbStats.connected,
                users: dbStats.users,
                groups: dbStats.groups,
                totalWealth: dbStats.totalWealth
            },
            memory: {
                used: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
                heap: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
            }
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthData, null, 2));
    } else if (req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('pong');
    } else if (req.url === '/stats') {
        try {
            const stats = await db.getStats();
            const dbInfo = db.getConnectionInfo();
            
            const statsData = {
                database: {
                    type: 'PostgreSQL',
                    host: dbInfo.host,
                    database: dbInfo.database,
                    connected: stats.connected,
                    users: stats.users,
                    groups: stats.groups,
                    settings: stats.settings,
                    totalWealth: stats.totalWealth
                },
                bot: {
                    name: config.BOT_NAME,
                    prefix: config.PREFIX,
                    uptime: Math.floor((Date.now() - startTime) / 1000),
                    environment: config.NODE_ENV,
                    status: botStatus
                },
                system: {
                    nodeVersion: process.version,
                    platform: process.platform,
                    memory: process.memoryUsage(),
                    pid: process.pid
                }
            };
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(statsData, null, 2));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch stats' }));
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

// Start health check server
server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Health check server running on port ${PORT}`);
    logger.info(`Health endpoint: http://localhost:${PORT}/health`);
    logger.info(`Stats endpoint: http://localhost:${PORT}/stats`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    botStatus = 'error';
    
    // Give some time for logging before exit
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    botStatus = 'error';
    
    // Give some time for logging before exit
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

// Graceful shutdown
async function gracefulShutdown(signal) {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    botStatus = 'shutting_down';
    
    try {
        // Close database connection
        if (db) {
            await db.disconnect();
            logger.info('Database connection closed');
        }
        
        // Close HTTP server
        server.close(() => {
            logger.info('HTTP server closed');
            process.exit(0);
        });
        
        // Force exit after 10 seconds
        setTimeout(() => {
            logger.warn('Force exiting after timeout');
            process.exit(1);
        }, 10000);
        
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function startBot() {
    try {
        logger.info(`Starting ${config.BOT_NAME}...`);
        logger.info(`Environment: ${config.NODE_ENV}`);
        logger.info(`Prefix: ${config.PREFIX}`);
        logger.info(`PostgreSQL Mode: ${!!config.DATABASE_URL ? 'URL' : 'Individual Params'}`);
        
        botStatus = 'connecting';
        const bot = await createBot();
        botStatus = 'running';
        
        // Keep the process alive
        process.stdin.resume();
        
        logger.info('Bot started successfully! 🚀');
        logger.info(`Health check available at: http://localhost:${PORT}/health`);
        logger.info(`Statistics available at: http://localhost:${PORT}/stats`);
        
    } catch (error) {
        logger.error('Failed to start bot:', error);
        botStatus = 'error';
        
        // Close database connection if it was opened
        try {
            if (db) {
                await db.disconnect();
            }
        } catch (dbError) {
            logger.error('Error closing database during startup failure:', dbError);
        }
        
        process.exit(1);
    }
}

// Start the bot
startBot();
