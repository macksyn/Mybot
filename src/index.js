#!/usr/bin/env node
import 'dotenv/config';
import http from 'http';
import { createBot } from './client.js';
import { logger } from './utils/logger.js';
import { config } from './config/config.js';
import { sessionManager } from './utils/sessionManager.js';
import { db } from './utils/database.js';

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
            prefix: config.PREFIX,
            features: {
                sessionPersistence: config.PERSIST_SESSIONS,
                pairingNumber: config.PAIRING_NUMBER,
                ownerNumber: config.OWNER_NUMBER,
                adminCount: config.ADMIN_NUMBERS?.length || 0,
                mongodbConnected: db.isConnected,
                sessionManagerConnected: sessionManager.isConnected
            }
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthData, null, 2));
    } else if (req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('pong');
    } else if (req.url === '/session') {
        // Session status endpoint
        const sessionStatus = {
            persistence: config.PERSIST_SESSIONS,
            mongoConnected: sessionManager.isConnected,
            sessionId: config.SESSION_ID,
            pairingNumber: config.PAIRING_NUMBER,
            timestamp: new Date().toISOString()
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sessionStatus, null, 2));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

// Start health check server
server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Health check server running on port ${PORT}`);
    logger.info(`Health endpoint: http://localhost:${PORT}/health`);
    logger.info(`Session endpoint: http://localhost:${PORT}/session`);
});

// Enhanced graceful shutdown
async function gracefulShutdown(signal) {
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    botStatus = 'shutting_down';
    
    try {
        // Save current session before shutdown
        if (config.PERSIST_SESSIONS) {
            logger.info('💾 Saving session before shutdown...');
            await sessionManager.saveSession();
        }
        
        // Close database connections
        logger.info('🔄 Closing database connections...');
        await db.shutdown();
        await sessionManager.shutdown();
        
        // Close HTTP server
        server.close(() => {
            logger.info('✅ Graceful shutdown completed');
            process.exit(0);
        });
    } catch (error) {
        logger.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
    logger.error('Uncaught Exception:', error);
    botStatus = 'error';
    
    try {
        // Try to save session even on error
        if (config.PERSIST_SESSIONS) {
            await sessionManager.saveSession();
        }
    } catch (saveError) {
        logger.error('Failed to save session during error:', saveError);
    }
    
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    botStatus = 'error';
    
    try {
        // Try to save session even on error
        if (config.PERSIST_SESSIONS) {
            await sessionManager.saveSession();
        }
    } catch (saveError) {
        logger.error('Failed to save session during error:', saveError);
    }
    
    process.exit(1);
});

// Graceful shutdown handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function startBot() {
    try {
        logger.info(`Starting ${config.BOT_NAME}...`);
        logger.info(`Environment: ${config.NODE_ENV}`);
        logger.info(`Prefix: ${config.PREFIX}`);
        logger.info(`Pairing Number: ${config.PAIRING_NUMBER}`);
        logger.info(`Owner Number: ${config.OWNER_NUMBER}`);
        logger.info(`Admin Numbers: ${config.ADMIN_NUMBERS.join(', ')}`);
        logger.info(`Session Persistence: ${config.PERSIST_SESSIONS ? 'Enabled' : 'Disabled'}`);
        
        botStatus = 'connecting';
        const bot = await createBot();
        botStatus = 'running';
        
        // Keep the process alive
        process.stdin.resume();
        
        logger.info('Bot started successfully! 🚀');
        logger.info(`Health check available at: http://localhost:${PORT}/health`);
        logger.info(`Session status at: http://localhost:${PORT}/session`);
        
        // Log important configuration
        logger.info('\n' + '='.repeat(50));
        logger.info('📋 CONFIGURATION SUMMARY');
        logger.info('='.repeat(50));
        logger.info(`🤖 Bot Name: ${config.BOT_NAME}`);
        logger.info(`🔧 Prefix: ${config.PREFIX}`);
        logger.info(`📱 Pairing (Login): ${config.PAIRING_NUMBER}`);
        logger.info(`👑 Owner (Admin): ${config.OWNER_NUMBER}`);
        logger.info(`👥 Admins: ${config.ADMIN_NUMBERS.join(', ')}`);
        logger.info(`💾 Persistent Sessions: ${config.PERSIST_SESSIONS ? 'ON' : 'OFF'}`);
        logger.info(`🗄️ Database: ${db.useFallback ? 'In-Memory (Fallback)' : 'MongoDB'}`);
        logger.info('='.repeat(50));
        
        if (config.PERSIST_SESSIONS && sessionManager.isConnected) {
            logger.info('💡 Sessions will persist across deployments!');
        } else if (config.PERSIST_SESSIONS && !sessionManager.isConnected) {
            logger.warn('⚠️ Session persistence enabled but MongoDB not connected!');
        } else {
            logger.info('⚠️ Session persistence disabled - will need to re-pair after each deployment');
        }
        
    } catch (error) {
        logger.error('Failed to start bot:', error);
        botStatus = 'error';
        process.exit(1);
    }
}

// Start the bot
startBot();
