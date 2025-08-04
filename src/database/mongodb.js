// 🔧 MONGODB CONNECTION DIAGNOSTIC & FIXES

// 1. COMMON ISSUES AND SOLUTIONS:

/*
❌ ISSUE 1: Environment Variables Not Loaded
- Check if MONGODB_URI is properly set in your .env file
- Verify DATABASE_NAME is set
*/

// 🔍 Quick diagnostic - Add this to your index.js before starting the bot:
console.log('🔍 MONGODB DIAGNOSTIC:');
console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('DATABASE_NAME exists:', !!process.env.DATABASE_NAME);
console.log('MONGODB_URI preview:', process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 20) + '...' : 'NOT SET');

/*
❌ ISSUE 2: Incorrect MongoDB URI Format
Examples of correct formats:
- MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/database
- Local MongoDB: mongodb://localhost:27017/database
- MongoDB with auth: mongodb://username:password@host:port/database
*/

/*
❌ ISSUE 3: Network/Firewall Issues
- MongoDB Atlas: Check IP whitelist (0.0.0.0/0 for development)
- Local MongoDB: Ensure MongoDB service is running
- Cloud deployment: Check network policies
*/

// 2. IMPROVED mongodb.js with better error handling:

import mongoose from 'mongoose';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

// Connection state tracking
let isConnected = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

// 🔧 ENHANCED CONNECTION FUNCTION
export async function connectToMongoDB() {
    if (isConnected && mongoose.connection.readyState === 1) {
        logger.info('📦 Already connected to MongoDB');
        return true;
    }
    
    connectionAttempts++;
    
    try {
        logger.info('🔄 Attempting MongoDB connection...');
        logger.info(`📍 URI: ${config.MONGODB_URI.substring(0, 30)}...`);
        logger.info(`🗄️  Database: ${config.DATABASE_NAME}`);
        logger.info(`🔄 Attempt: ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}`);
        
        // Close existing connection if any
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
            logger.info('🔌 Closed existing connection');
        }
        
        // Set strict query mode
        mongoose.set('strictQuery', false);
        
        // 🚀 OPTIMIZED CONNECTION OPTIONS
        const connectionOptions = {
            dbName: config.DATABASE_NAME,
            
            // Connection pool settings
            maxPoolSize: 10,
            minPoolSize: 1,
            maxIdleTimeMS: 30000,
            
            // Timeout settings
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 15000,
            
            // Buffering settings
            bufferCommands: false,
            bufferMaxEntries: 0,
            
            // Reliability settings
            retryWrites: true,
            retryReads: true,
            
            // Additional options for stability
            heartbeatFrequencyMS: 10000,
            family: 4, // Use IPv4, skip trying IPv6
        };
        
        // Add authentication options if URI contains credentials
        if (config.MONGODB_URI.includes('@')) {
            connectionOptions.authSource = 'admin';
        }
        
        logger.info('⚙️  Connection options configured');
        
        // 🔗 CONNECT TO MONGODB
        await mongoose.connect(config.MONGODB_URI, connectionOptions);
        
        // Verify connection
        if (mongoose.connection.readyState === 1) {
            isConnected = true;
            connectionAttempts = 0;
            
            logger.info('✅ MongoDB connected successfully!');
            logger.info(`🗄️  Database: ${mongoose.connection.db.databaseName}`);
            logger.info(`🖥️  Host: ${mongoose.connection.host}:${mongoose.connection.port}`);
            logger.info(`📊 Ready State: ${mongoose.connection.readyState}`);
            
            // Test database with a simple operation
            await testDatabaseConnection();
            
            // Initialize models and default data
            const modelsInitialized = initializeModels();
            if (modelsInitialized) {
                await initializeDefaultSettings();
                logger.info('🎯 Database setup completed');
            }
            
            // Set up connection monitoring
            setupConnectionEventListeners();
            
            return true;
        } else {
            throw new Error(`Connection state: ${mongoose.connection.readyState}`);
        }
        
    } catch (error) {
        isConnected = false;
        
        // 🚨 DETAILED ERROR LOGGING
        logger.error('❌ MongoDB connection failed:');
        logger.error(`   Error: ${error.message}`);
        logger.error(`   Code: ${error.code || 'N/A'}`);
        logger.error(`   Name: ${error.name || 'N/A'}`);
        
        // Specific error handling
        if (error.message.includes('ENOTFOUND')) {
            logger.error('🌐 DNS Resolution failed - Check your MongoDB URI hostname');
        } else if (error.message.includes('ECONNREFUSED')) {
            logger.error('🚫 Connection refused - MongoDB server may be down');
        } else if (error.message.includes('authentication failed')) {
            logger.error('🔐 Authentication failed - Check username/password');
        } else if (error.message.includes('network')) {
            logger.error('🌍 Network error - Check internet connection/firewall');
        } else if (error.message.includes('timeout')) {
            logger.error('⏰ Connection timeout - Server may be slow or unreachable');
        }
        
        // Retry logic with exponential backoff
        if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
            const delay = Math.min(connectionAttempts * 3000, 15000);
            logger.warn(`🔄 Retrying in ${delay/1000}s... (${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})`);
            
            setTimeout(() => {
                connectToMongoDB();
            }, delay);
        } else {
            logger.error('💀 Max connection attempts reached');
            logger.error('🔧 TROUBLESHOOTING STEPS:');
            logger.error('   1. Check MONGODB_URI in .env file');
            logger.error('   2. Verify MongoDB server is running');
            logger.error('   3. Check network connectivity');
            logger.error('   4. Verify database credentials');
            logger.error('   5. Check firewall/security groups');
            
            // Don't exit in production, just log the error
            if (config.NODE_ENV !== 'production') {
                process.exit(1);
            }
        }
        
        return false;
    }
}

// 🧪 TEST DATABASE CONNECTION
async function testDatabaseConnection() {
    try {
        // Simple ping test
        await mongoose.connection.db.admin().ping();
        logger.info('🏓 Database ping successful');
        
        // List collections test
        const collections = await mongoose.connection.db.listCollections().toArray();
        logger.info(`📋 Found ${collections.length} collections`);
        
        return true;
    } catch (error) {
        logger.error('❌ Database test failed:', error.message);
        return false;
    }
}

// Your existing models and helper functions here...
// (Keep all your existing schemas and model initialization code)

// 🎯 MONGODB HEALTH CHECK FUNCTION
export const mongoHealthCheck = async () => {
    try {
        if (!isConnected || mongoose.connection.readyState !== 1) {
            return {
                status: 'disconnected',
                readyState: mongoose.connection.readyState,
                error: 'Not connected to MongoDB'
            };
        }
        
        // Test with ping
        await mongoose.connection.db.admin().ping();
        
        const stats = await mongoose.connection.db.stats();
        
        return {
            status: 'connected',
            readyState: mongoose.connection.readyState,
            database: stats.db,
            collections: stats.collections,
            dataSize: `${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`,
            host: mongoose.connection.host,
            port: mongoose.connection.port
        };
        
    } catch (error) {
        return {
            status: 'error',
            readyState: mongoose.connection.readyState,
            error: error.message
        };
    }
};

// 3. CREATE A .env TEMPLATE FILE:

/*
Create a file named ".env" in your project root with this content:

# Bot Configuration
BOT_NAME=Groq 🤖
PREFIX=!
OWNER_NUMBER=2348166353338
TIMEZONE=Africa/Lagos

# Authentication
USE_PAIRING_CODE=true
SEND_STARTUP_MESSAGE=true

# MongoDB Configuration (CHOOSE ONE):

# Option 1: MongoDB Atlas (Cloud - Recommended)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/whatsapp-bot?retryWrites=true&w=majority
DATABASE_NAME=whatsapp-bot

# Option 2: Local MongoDB
# MONGODB_URI=mongodb://localhost:27017/whatsapp-bot
# DATABASE_NAME=whatsapp-bot

# Option 3: MongoDB with authentication
# MONGODB_URI=mongodb://username:password@host:port/whatsapp-bot
# DATABASE_NAME=whatsapp-bot

# Environment
NODE_ENV=development
PORT=8000

# Features (optional)
ENABLE_WEATHER=true
ENABLE_JOKES=true
ENABLE_QUOTES=true
ENABLE_CALCULATOR=true
ENABLE_ADMIN_COMMANDS=true

# Logging
LOG_LEVEL=info
LOG_TO_FILE=false
*/

// 4. QUICK MONGODB TEST SCRIPT
// Create a file named "test-mongodb.js" and run with: node test-mongodb.js

/*
import 'dotenv/config';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-bot';
const DATABASE_NAME = process.env.DATABASE_NAME || 'whatsapp-bot';

console.log('🧪 Testing MongoDB Connection...');
console.log('URI:', MONGODB_URI.substring(0, 30) + '...');
console.log('Database:', DATABASE_NAME);

async function testConnection() {
    try {
        await mongoose.connect(MONGODB_URI, {
            dbName: DATABASE_NAME,
            serverSelectionTimeoutMS: 10000
        });
        
        console.log('✅ Connection successful!');
        console.log('Host:', mongoose.connection.host);
        console.log('Database:', mongoose.connection.db.databaseName);
        
        // Test ping
        await mongoose.connection.db.admin().ping();
        console.log('✅ Ping successful!');
        
        // Test write operation
        const testCollection = mongoose.connection.db.collection('test');
        await testCollection.insertOne({ test: true, timestamp: new Date() });
        console.log('✅ Write test successful!');
        
        // Clean up test
        await testCollection.deleteOne({ test: true });
        console.log('✅ All tests passed!');
        
    } catch (error) {
        console.error('❌ Connection test failed:');
        console.error('Error:', error.message);
        console.error('Code:', error.code);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Connection closed');
        process.exit(0);
    }
}

testConnection();
*/
