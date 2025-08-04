#!/usr/bin/env node
import 'dotenv/config';
import { logger } from '../utils/logger.js';
import connectToPostgreSQL, { db } from './postgresql.js';

async function runMigration() {
    try {
        logger.info('🚀 Starting database migration...');
        
        const connected = await connectToPostgreSQL();
        if (!connected) {
            logger.error('❌ Failed to connect to database');
            process.exit(1);
        }
        
        logger.info('✅ Database migration completed successfully!');
        
        // Display final stats
        const stats = await db.getStats();
        logger.info('📊 Final Database Statistics:');
        logger.info(`   Users: ${stats.users}`);
        logger.info(`   Groups: ${stats.groups}`);
        logger.info(`   Settings: ${stats.settings}`);
        logger.info(`   Total Wealth: ₦${stats.totalWealth.toLocaleString()}`);
        
        await db.disconnect();
        process.exit(0);
        
    } catch (error) {
        logger.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runMigration();
}

export default runMigration;
