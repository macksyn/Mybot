#!/usr/bin/env node

import 'dotenv/config';
import { createBot } from './client.js';
import { logger } from './utils/logger.js';
import { config } from './config/config.js';

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

async function startBot() {
    try {
        logger.info(`Starting ${config.BOT_NAME}...`);
        logger.info(`Environment: ${config.NODE_ENV}`);
        logger.info(`Prefix: ${config.PREFIX}`);
        
        const bot = await createBot();
        
        // Keep the process alive
        process.stdin.resume();
        
        logger.info('Bot started successfully! 🚀');
        
    } catch (error) {
        logger.error('Failed to start bot:', error);
        process.exit(1);
    }
}

// Start the bot
startBot();
