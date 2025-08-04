import mongoose from 'mongoose';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

// MongoDB connection state
let isConnected = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

// Database models will be stored here
export const models = {};

// User Schema for Economy and General Data
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: null },
    phoneNumber: { type: String, default: null },
    
    // Economy fields
    economy: {
        balance: { type: Number, default: 1000 },
        bank: { type: Number, default: 0 },
        totalEarned: { type: Number, default: 0 },
        totalSpent: { type: Number, default: 0 },
        workCount: { type: Number, default: 0 },
        robCount: { type: Number, default: 0 },
        lastDaily: { type: String, default: null },
        rank: { type: String, default: 'Newbie' },
        inventory: [{ 
            itemId: String, 
            name: String, 
            quantity: Number, 
            purchaseDate: Date 
        }],
        clan: { type: String, default: null },
        bounty: { type: Number, default: 0 }
    },
    
    // Attendance and activity
    attendance: {
        lastAttendance: { type: String, default: null },
        totalAttendances: { type: Number, default: 0 },
        streak: { type: Number, default: 0 },
        longestStreak: { type: Number, default: 0 },
        birthdayData: { type: Object, default: null }
    },
    
    // Bot usage stats
    stats: {
        commandsUsed: { type: Number, default: 0 },
        messagesReceived: { type: Number, default: 0 },
        firstSeen: { type: Date, default: Date.now },
        lastSeen: { type: Date, default: Date.now },
        isBlocked: { type: Boolean, default: false },
        warningCount: { type: Number, default: 0 }
    },
    
    // Preferences
    preferences: {
        language: { type: String, default: 'en' },
        timezone: { type: String, default: config.TIMEZONE },
        notifications: { type: Boolean, default: true }
    }
}, {
    timestamps: true,
    collection: 'users'
});

// Settings Schema for Bot Configuration
const settingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'general' },
    updatedBy: { type: String, default: null }
}, {
    timestamps: true,
    collection: 'settings'
});

// Sessions Schema for WhatsApp Authentication (optional)
const sessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true, index: true },
    creds: { type: Object, required: true },
    keys: { type: Object, required: true },
    lastUpdated: { type: Date, default: Date.now }
}, {
    timestamps: true,
    collection: 'sessions'
});

// Clans Schema for Clan System
const clanSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, index: true },
    leader: { type: String, required: true },
    members: [{ type: String }],
    level: { type: Number, default: 1 },
    bank: { type: Number, default: 0 },
    description: { type: String, default: '' },
    settings: {
        isPrivate: { type: Boolean, default: false },
        maxMembers: { type: Number, default: 50 },
        requireApproval: { type: Boolean, default: true }
    }
}, {
    timestamps: true,
    collection: 'clans'
});

// Logs Schema for Bot Activity Logging
const logSchema = new mongoose.Schema({
    level: { type: String, required: true, index: true },
    message: { type: String, required: true },
    meta: { type: Object, default: {} },
    userId: { type: String, default: null, index: true },
    command: { type: String, default: null, index: true },
    error: { type: Object, default: null }
}, {
    timestamps: true,
    collection: 'logs',
    // Auto-delete logs older than 30 days
    expires: '30d'
});

// Initialize models
function initializeModels() {
    try {
        models.User = mongoose.model('User', userSchema);
        models.Settings = mongoose.model('Settings', settingsSchema);
        models.Session = mongoose.model('Session', sessionSchema);
        models.Clan = mongoose.model('Clan', clanSchema);
        models.Log = mongoose.model('Log', logSchema);
        
        logger.info('📋 Database models initialized successfully');
        return true;
    } catch (error) {
        logger.error('❌ Failed to initialize database models:', error);
        return false;
    }
}

// Connect to MongoDB with retry logic
async function connectToMongoDB() {
    if (isConnected) {
        logger.info('📦 Already connected to MongoDB');
        return true;
    }
    
    connectionAttempts++;
    
    try {
        logger.info('🔄 Connecting to MongoDB...');
        logger.info(`📍 Database: ${config.DATABASE_NAME}`);
        logger.info(`🔗 Connection attempt: ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}`);
        
        // Set mongoose options
        mongoose.set('strictQuery', false);
        
        const connectionOptions = {
            dbName: config.DATABASE_NAME,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            bufferCommands: false,
            bufferMaxEntries: 0,
            // For MongoDB Atlas or cloud databases
            retryWrites: true,
            retryReads: true
        };
        
        // Connect to MongoDB
        await mongoose.connect(config.MONGODB_URI, connectionOptions);
        
        isConnected = true;
        connectionAttempts = 0; // Reset on successful connection
        
        logger.info('✅ Connected to MongoDB successfully!');
        logger.info(`🗄️  Database Name: ${config.DATABASE_NAME}`);
        logger.info(`📊 Connection State: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting'}`);
        
        // Initialize models
        const modelsInitialized = initializeModels();
        if (!modelsInitialized) {
            throw new Error('Failed to initialize database models');
        }
        
        // Initialize default settings if needed
        await initializeDefaultSettings();
        
        // Set up connection event listeners
        setupConnectionEventListeners();
        
        return true;
        
    } catch (error) {
        isConnected = false;
        logger.error('❌ MongoDB connection failed:', error.message);
        
        if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
            const delay = Math.min(connectionAttempts * 2000, 10000); // Exponential backoff, max 10s
            logger.info(`🔄 Retrying MongoDB connection in ${delay/1000} seconds...`);
            
            setTimeout(() => {
                connectToMongoDB();
            }, delay);
        } else {
            logger.error(`❌ Max MongoDB connection attempts (${MAX_CONNECTION_ATTEMPTS}) reached. Exiting...`);
            process.exit(1);
        }
        
        return false;
    }
}

// Set up MongoDB connection event listeners
function setupConnectionEventListeners() {
    // Connection successful
    mongoose.connection.on('connected', () => {
        logger.info('🔗 Mongoose connected to MongoDB');
        isConnected = true;
    });
    
    // Connection error
    mongoose.connection.on('error', (error) => {
        logger.error('❌ MongoDB connection error:', error);
        isConnected = false;
    });
    
    // Connection disconnected
    mongoose.connection.on('disconnected', () => {
        logger.warn('⚠️  MongoDB disconnected');
        isConnected = false;
        
        // Attempt to reconnect
        if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
            logger.info('🔄 Attempting to reconnect to MongoDB...');
            setTimeout(() => {
                connectToMongoDB();
            }, 5000);
        }
    });
    
    // Application termination
    process.on('SIGINT', async () => {
        logger.info('🔄 Closing MongoDB connection...');
        await mongoose.connection.close();
        logger.info('✅ MongoDB connection closed');
    });
}

// Initialize default settings
async function initializeDefaultSettings() {
    try {
        const defaultSettings = [
            {
                key: 'economy.currency',
                value: '₦',
                description: 'Currency symbol for economy system',
                category: 'economy'
            },
            {
                key: 'economy.startingBalance',
                value: 1000,
                description: 'Starting balance for new users',
                category: 'economy'
            },
            {
                key: 'economy.dailyMinAmount',
                value: 500,
                description: 'Minimum daily reward amount',
                category: 'economy'
            },
            {
                key: 'economy.dailyMaxAmount',
                value: 1500,
                description: 'Maximum daily reward amount',
                category: 'economy'
            },
            {
                key: 'bot.maintenance',
                value: false,
                description: 'Bot maintenance mode',
                category: 'system'
            },
            {
                key: 'bot.version',
                value: '1.0.0',
                description: 'Bot version',
                category: 'system'
            }
        ];
        
        for (const setting of defaultSettings) {
            await models.Settings.updateOne(
                { key: setting.key },
                { $setOnInsert: setting },
                { upsert: true }
            );
        }
        
        logger.info('⚙️  Default settings initialized');
        
    } catch (error) {
        logger.error('❌ Failed to initialize default settings:', error);
    }
}

// Helper functions for database operations
export const db = {
    // Check if connected
    isConnected: () => isConnected && mongoose.connection.readyState === 1,
    
    // Get connection info
    getConnectionInfo: () => ({
        connected: isConnected,
        readyState: mongoose.connection.readyState,
        databaseName: config.DATABASE_NAME,
        host: mongoose.connection.host,
        port: mongoose.connection.port
    }),
    
    // Close connection
    disconnect: async () => {
        if (isConnected) {
            await mongoose.connection.close();
            isConnected = false;
            logger.info('🔌 MongoDB connection closed');
        }
    },
    
    // Get database stats
    getStats: async () => {
        if (!isConnected) return null;
        
        try {
            const stats = await mongoose.connection.db.stats();
            const collections = await mongoose.connection.db.listCollections().toArray();
            
            return {
                database: stats.db,
                collections: collections.length,
                dataSize: stats.dataSize,
                indexSize: stats.indexSize,
                storageSize: stats.storageSize,
                objects: stats.objects
            };
        } catch (error) {
            logger.error('Failed to get database stats:', error);
            return null;
        }
    }
};

// 🎯 PROPER ES6 EXPORTS - This is the key fix!
export default connectToMongoDB;
