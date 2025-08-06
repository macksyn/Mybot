import { MongoClient } from 'mongodb';
import { logger } from './logger.js';
import { config } from '../config/config.js';

/**
 * MongoDB-based persistent storage for free hosting platforms
 * Enhanced with better error handling and reconnection logic
 */
class ExternalDatabase {
    constructor() {
        this.client = null;
        this.db = null;
        this.isConnected = false;
        this.connectionString = process.env.MONGODB_URI || process.env.DATABASE_URL;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 5000;
        
        // Cache for frequently accessed data
        this.cache = new Map();
        this.cacheTimeout = 30000; // 30 seconds
        
        if (!this.connectionString) {
            logger.warn('No MongoDB connection string found. Using fallback storage.');
            this.useFallback = true;
            this.fallbackData = {
                users: new Map(),
                economy: new Map(),
                groups: new Map(),
                settings: new Map(),
                attendance: new Map(),
                stats: {
                    commandsExecuted: 0,
                    messagesReceived: 0,
                    startTime: Date.now()
                }
            };
            return;
        }
        
        this.init();
    }
    
    async init() {
        if (this.useFallback) {
            logger.info('✅ Using fallback in-memory storage');
            this.isConnected = true;
            return;
        }
        
        try {
            logger.info('🔗 Connecting to MongoDB...');
            
            this.client = new MongoClient(this.connectionString, {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 10000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 10000,
                heartbeatFrequencyMS: 10000,
                retryWrites: true,
            });
            
            await this.client.connect();
            this.db = this.client.db('whatsapp_bot');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            // Test the connection
            await this.db.admin().ping();
            
            // Create indexes for better performance
            await this.createIndexes();
            
            // Setup connection monitoring
            this.setupConnectionMonitoring();
            
            logger.info('✅ Connected to MongoDB database successfully');
            
        } catch (error) {
            logger.error('❌ Failed to connect to MongoDB:', error.message);
            await this.handleConnectionError(error);
        }
    }
    
    setupConnectionMonitoring() {
        if (!this.client) return;
        
        this.client.on('close', () => {
            logger.warn('🔌 MongoDB connection closed');
            this.isConnected = false;
            this.scheduleReconnect();
        });
        
        this.client.on('error', (error) => {
            logger.error('💥 MongoDB connection error:', error.message);
            this.isConnected = false;
            this.scheduleReconnect();
        });
        
        this.client.on('reconnect', () => {
            logger.info('🔄 MongoDB reconnected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
        });
    }
    
    async handleConnectionError(error) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('🔴 Max reconnection attempts reached. Switching to fallback mode.');
            this.useFallback = true;
            this.isConnected = true;
            this.fallbackData = {
                users: new Map(),
                economy: new Map(),
                groups: new Map(),
                settings: new Map(),
                attendance: new Map(),
                stats: {
                    commandsExecuted: 0,
                    messagesReceived: 0,
                    startTime: Date.now()
                }
            };
            return;
        }
        
        this.scheduleReconnect();
    }
    
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts || this.useFallback) return;
        
        this.reconnectAttempts++;
        const delay = this.reconnectInterval * this.reconnectAttempts;
        
        logger.info(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        
        setTimeout(async () => {
            try {
                await this.init();
            } catch (error) {
                logger.error('🔄 Reconnection attempt failed:', error.message);
            }
        }, delay);
    }
    
    async createIndexes() {
        if (this.useFallback) return;
        
        try {
            // Create indexes for better query performance
            await Promise.allSettled([
                this.db.collection('users').createIndex({ userId: 1 }, { unique: true }),
                this.db.collection('economy').createIndex({ userId: 1 }, { unique: true }),
                this.db.collection('attendance').createIndex({ userId: 1 }),
                this.db.collection('attendance').createIndex({ userId: 1, date: 1 }),
                this.db.collection('groups').createIndex({ groupId: 1 }, { unique: true }),
                this.db.collection('settings').createIndex({ key: 1 }, { unique: true })
            ]);
            
            logger.debug('📚 Database indexes created');
        } catch (error) {
            logger.warn('⚠️ Could not create some indexes:', error.message);
        }
    }
    
    async ensureConnection() {
        if (this.useFallback) return true;
        
        if (!this.isConnected) {
            await this.init();
        }
        
        // Test connection with ping
        try {
            if (this.db) {
                await this.db.admin().ping();
                return true;
            }
        } catch (error) {
            logger.warn('📡 Connection test failed:', error.message);
            this.isConnected = false;
            return false;
        }
        
        return this.isConnected;
    }
    
    // Cache management
    getCacheKey(collection, id) {
        return `${collection}:${id}`;
    }
    
    setCache(collection, id, data) {
        const key = this.getCacheKey(collection, id);
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
        
        // Clean old cache entries
        setTimeout(() => {
            this.cache.delete(key);
        }, this.cacheTimeout);
    }
    
    getCache(collection, id) {
        const key = this.getCacheKey(collection, id);
        const cached = this.cache.get(key);
        
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }
        
        this.cache.delete(key);
        return null;
    }
    
    // Fallback methods
    async fallbackGet(collection, query) {
        const data = this.fallbackData[collection];
        if (data instanceof Map) {
            const key = query.userId || query.groupId || query.key;
            return data.get(key) || null;
        }
        return null;
    }
    
    async fallbackSave(collection, query, document) {
        const data = this.fallbackData[collection];
        if (data instanceof Map) {
            const key = query.userId || query.groupId || query.key || document.userId || document.groupId || document.key;
            data.set(key, document);
        }
        return document;
    }
    
    async fallbackGetAll(collection) {
        const data = this.fallbackData[collection];
        if (data instanceof Map) {
            return Array.from(data.values());
        }
        return [];
    }
    
    // User management
    async getUser(userId) {
        try {
            // Try cache first
            const cached = this.getCache('users', userId);
            if (cached) return cached;
            
            if (this.useFallback) {
                return await this.fallbackGet('users', { userId });
            }
            
            await this.ensureConnection();
            const user = await this.db.collection('users').findOne({ userId });
            
            if (user) {
                this.setCache('users', userId, user);
            }
            
            return user;
        } catch (error) {
            logger.error('Error getting user:', error.message);
            return await this.fallbackGet('users', { userId });
        }
    }
    
    async saveUser(userId, userData) {
        try {
            const updatedUser = {
                ...userData,
                userId,
                lastSeen: Date.now(),
                updatedAt: Date.now()
            };
            
            if (this.useFallback) {
                return await this.fallbackSave('users', { userId }, updatedUser);
            }
            
            await this.ensureConnection();
            await this.db.collection('users').replaceOne(
                { userId },
                updatedUser,
                { upsert: true }
            );
            
            // Update cache
            this.setCache('users', userId, updatedUser);
            
            return updatedUser;
        } catch (error) {
            logger.error('Error saving user:', error.message);
            return await this.fallbackSave('users', { userId }, {
                ...userData,
                userId,
                lastSeen: Date.now(),
                updatedAt: Date.now()
            });
        }
    }
    
    async getAllUsers() {
        try {
            if (this.useFallback) {
                return await this.fallbackGetAll('users');
            }
            
            await this.ensureConnection();
            return await this.db.collection('users').find({}).toArray();
        } catch (error) {
            logger.error('Error getting all users:', error.message);
            return await this.fallbackGetAll('users');
        }
    }
    
    // Economy management
    async getEconomy(userId) {
        try {
            const cached = this.getCache('economy', userId);
            if (cached) return cached;
            
            if (this.useFallback) {
                return await this.fallbackGet('economy', { userId });
            }
            
            await this.ensureConnection();
            const economy = await this.db.collection('economy').findOne({ userId });
            
            if (economy) {
                this.setCache('economy', userId, economy);
            }
            
            return economy;
        } catch (error) {
            logger.error('Error getting economy data:', error.message);
            return await this.fallbackGet('economy', { userId });
        }
    }
    
    async saveEconomy(userId, economyData) {
        try {
            const updated = {
                ...economyData,
                userId,
                lastUpdated: Date.now()
            };
            
            if (this.useFallback) {
                return await this.fallbackSave('economy', { userId }, updated);
            }
            
            await this.ensureConnection();
            await this.db.collection('economy').replaceOne(
                { userId },
                updated,
                { upsert: true }
            );
            
            this.setCache('economy', userId, updated);
            return updated;
        } catch (error) {
            logger.error('Error saving economy data:', error.message);
            return await this.fallbackSave('economy', { userId }, updated);
        }
    }
    
    async getAllEconomyProfiles() {
        try {
            if (this.useFallback) {
                return await this.fallbackGetAll('economy');
            }
            
            await this.ensureConnection();
            return await this.db.collection('economy').find({}).toArray();
        } catch (error) {
            logger.error('Error getting economy profiles:', error.message);
            return await this.fallbackGetAll('economy');
        }
    }
    
    // Attendance management
    async getAttendance(userId) {
        try {
            if (this.useFallback) {
                return await this.fallbackGet('attendance', { userId });
            }
            
            await this.ensureConnection();
            return await this.db.collection('attendance').findOne({ userId });
        } catch (error) {
            logger.error('Error getting attendance:', error.message);
            return await this.fallbackGet('attendance', { userId });
        }
    }
    
    async saveAttendance(userId, attendanceData) {
        try {
            const updated = {
                ...attendanceData,
                userId,
                lastUpdated: Date.now()
            };
            
            if (this.useFallback) {
                return await this.fallbackSave('attendance', { userId }, updated);
            }
            
            await this.ensureConnection();
            await this.db.collection('attendance').replaceOne(
                { userId },
                updated,
                { upsert: true }
            );
            
            return updated;
        } catch (error) {
            logger.error('Error saving attendance:', error.message);
            return await this.fallbackSave('attendance', { userId }, updated);
        }
    }
    
    // Group management
    async getGroup(groupId) {
        try {
            if (this.useFallback) {
                return await this.fallbackGet('groups', { groupId });
            }
            
            await this.ensureConnection();
            return await this.db.collection('groups').findOne({ groupId });
        } catch (error) {
            logger.error('Error getting group:', error.message);
            return await this.fallbackGet('groups', { groupId });
        }
    }
    
    async saveGroup(groupId, groupData) {
        try {
            const updated = {
                ...groupData,
                groupId,
                lastActivity: Date.now(),
                updatedAt: Date.now()
            };
            
            if (this.useFallback) {
                return await this.fallbackSave('groups', { groupId }, updated);
            }
            
            await this.ensureConnection();
            await this.db.collection('groups').replaceOne(
                { groupId },
                updated,
                { upsert: true }
            );
            
            return updated;
        } catch (error) {
            logger.error('Error saving group:', error.message);
            return await this.fallbackSave('groups', { groupId }, updated);
        }
    }
    
    async getAllGroups() {
        try {
            if (this.useFallback) {
                return await this.fallbackGetAll('groups');
            }
            
            await this.ensureConnection();
            return await this.db.collection('groups').find({}).toArray();
        } catch (error) {
            logger.error('Error getting all groups:', error.message);
            return await this.fallbackGetAll('groups');
        }
    }
    
    // Settings management
    async getSetting(key) {
        try {
            if (this.useFallback) {
                const setting = await this.fallbackGet('settings', { key });
                return setting?.value || null;
            }
            
            await this.ensureConnection();
            const result = await this.db.collection('settings').findOne({ key });
            return result?.value || null;
        } catch (error) {
            logger.error('Error getting setting:', error.message);
            const setting = await this.fallbackGet('settings', { key });
            return setting?.value || null;
        }
    }
    
    async setSetting(key, value) {
        try {
            const setting = { key, value, updatedAt: Date.now() };
            
            if (this.useFallback) {
                return await this.fallbackSave('settings', { key }, setting);
            }
            
            await this.ensureConnection();
            await this.db.collection('settings').replaceOne(
                { key },
                setting,
                { upsert: true }
            );
            
            return value;
        } catch (error) {
            logger.error('Error setting value:', error.message);
            await this.fallbackSave('settings', { key }, { key, value, updatedAt: Date.now() });
            return value;
        }
    }
    
    async getAllSettings() {
        try {
            if (this.useFallback) {
                const settings = await this.fallbackGetAll('settings');
                const result = {};
                settings.forEach(setting => {
                    result[setting.key] = setting.value;
                });
                return result;
            }
            
            await this.ensureConnection();
            const settings = await this.db.collection('settings').find({}).toArray();
            const result = {};
            settings.forEach(setting => {
                result[setting.key] = setting.value;
            });
            return result;
        } catch (error) {
            logger.error('Error getting all settings:', error.message);
            return {};
        }
    }
    
    // Statistics
    async getStats() {
        try {
            if (this.useFallback) {
                const [userCount, economyCount, groupCount] = [
                    this.fallbackData.users.size,
                    this.fallbackData.economy.size,
                    this.fallbackData.groups.size
                ];
                
                return {
                    ...this.fallbackData.stats,
                    totalUsers: userCount,
                    totalEconomyProfiles: economyCount,
                    totalGroups: groupCount,
                    uptime: Date.now() - this.fallbackData.stats.startTime
                };
            }
            
            await this.ensureConnection();
            const [userCount, economyCount, groupCount] = await Promise.all([
                this.db.collection('users').countDocuments(),
                this.db.collection('economy').countDocuments(),
                this.db.collection('groups').countDocuments()
            ]);
            
            const statsDoc = await this.db.collection('stats').findOne({ _id: 'global' });
            const stats = statsDoc || {
                commandsExecuted: 0,
                messagesReceived: 0,
                startTime: Date.now()
            };
            
            return {
                ...stats,
                totalUsers: userCount,
                totalEconomyProfiles: economyCount,
                totalGroups: groupCount,
                uptime: Date.now() - stats.startTime
            };
        } catch (error) {
            logger.error('Error getting stats:', error.message);
            return {
                totalUsers: 0,
                totalEconomyProfiles: 0,
                totalGroups: 0,
                commandsExecuted: 0,
                messagesReceived: 0,
                uptime: 0
            };
        }
    }
    
    async incrementCommandCount() {
        try {
            if (this.useFallback) {
                this.fallbackData.stats.commandsExecuted++;
                this.fallbackData.stats.lastCommandAt = Date.now();
                return;
            }
            
            await this.ensureConnection();
            await this.db.collection('stats').updateOne(
                { _id: 'global' },
                { 
                    $inc: { commandsExecuted: 1 },
                    $set: { lastCommandAt: Date.now() }
                },
                { upsert: true }
            );
        } catch (error) {
            logger.error('Error incrementing command count:', error.message);
            // Fallback increment
            if (this.fallbackData?.stats) {
                this.fallbackData.stats.commandsExecuted++;
            }
        }
    }
    
    async incrementMessageCount() {
        try {
            if (this.useFallback) {
                this.fallbackData.stats.messagesReceived++;
                this.fallbackData.stats.lastMessageAt = Date.now();
                return;
            }
            
            await this.ensureConnection();
            await this.db.collection('stats').updateOne(
                { _id: 'global' },
                { 
                    $inc: { messagesReceived: 1 },
                    $set: { lastMessageAt: Date.now() }
                },
                { upsert: true }
            );
        } catch (error) {
            logger.error('Error incrementing message count:', error.message);
            // Fallback increment
            if (this.fallbackData?.stats) {
                this.fallbackData.stats.messagesReceived++;
            }
        }
    }
    
    // Data export/import for migration
    async exportData() {
        try {
            if (this.useFallback) {
                const users = {};
                const economy = {};
                const groups = {};
                const attendance = {};
                const settings = {};
                
                this.fallbackData.users.forEach((value, key) => {
                    users[key] = value;
                });
                this.fallbackData.economy.forEach((value, key) => {
                    economy[key] = value;
                });
                this.fallbackData.groups.forEach((value, key) => {
                    groups[key] = value;
                });
                this.fallbackData.attendance.forEach((value, key) => {
                    attendance[key] = value;
                });
                this.fallbackData.settings.forEach((value, key) => {
                    settings[key] = value.value;
                });
                
                return {
                    users,
                    economy,
                    groups,
                    attendance,
                    settings,
                    stats: this.fallbackData.stats,
                    exportedAt: Date.now(),
                    version: '2.0.0'
                };
            }
            
            await this.ensureConnection();
            const [users, economy, groups, settings, attendance] = await Promise.all([
                this.db.collection('users').find({}).toArray(),
                this.db.collection('economy').find({}).toArray(),
                this.db.collection('groups').find({}).toArray(),
                this.db.collection('settings').find({}).toArray(),
                this.db.collection('attendance').find({}).toArray()
            ]);
            
            const stats = await this.db.collection('stats').findOne({ _id: 'global' });
            
            return {
                users: users.reduce((acc, user) => {
                    acc[user.userId] = user;
                    return acc;
                }, {}),
                economy: economy.reduce((acc, eco) => {
                    acc[eco.userId] = eco;
                    return acc;
                }, {}),
                groups: groups.reduce((acc, group) => {
                    acc[group.groupId] = group;
                    return acc;
                }, {}),
                attendance: attendance.reduce((acc, att) => {
                    acc[att.userId] = att;
                    return acc;
                }, {}),
                settings: settings.reduce((acc, setting) => {
                    acc[setting.key] = setting.value;
                    return acc;
                }, {}),
                stats: stats || {},
                exportedAt: Date.now(),
                version: '2.0.0'
            };
        } catch (error) {
            logger.error('Error exporting data:', error.message);
            throw error;
        }
    }
    
    async importData(importData) {
        try {
            logger.info('📥 Starting data import...');
            
            if (this.useFallback) {
                // Clear existing data
                this.fallbackData.users.clear();
                this.fallbackData.economy.clear();
                this.fallbackData.groups.clear();
                this.fallbackData.settings.clear();
                this.fallbackData.attendance.clear();
                
                // Import new data
                if (importData.users) {
                    Object.entries(importData.users).forEach(([userId, userData]) => {
                        this.fallbackData.users.set(userId, userData);
                    });
                }
                
                if (importData.economy) {
                    Object.entries(importData.economy).forEach(([userId, economyData]) => {
                        this.fallbackData.economy.set(userId, economyData);
                    });
                }
                
                if (importData.groups) {
                    Object.entries(importData.groups).forEach(([groupId, groupData]) => {
                        this.fallbackData.groups.set(groupId, groupData);
                    });
                }
                
                if (importData.settings) {
                    Object.entries(importData.settings).forEach(([key, value]) => {
                        this.fallbackData.settings.set(key, { key, value, importedAt: Date.now() });
                    });
                }
                
                if (importData.attendance) {
                    Object.entries(importData.attendance).forEach(([userId, attendanceData]) => {
                        this.fallbackData.attendance.set(userId, attendanceData);
                    });
                }
                
                if (importData.stats) {
                    this.fallbackData.stats = { ...importData.stats, importedAt: Date.now() };
                }
                
                logger.info('✅ Data imported successfully (fallback mode)');
                return true;
            }
            
            await this.ensureConnection();
            const session = this.client.startSession();
            
            await session.withTransaction(async () => {
                // Clear existing data
                await Promise.all([
                    this.db.collection('users').deleteMany({}),
                    this.db.collection('economy').deleteMany({}),
                    this.db.collection('groups').deleteMany({}),
                    this.db.collection('settings').deleteMany({}),
                    this.db.collection('attendance').deleteMany({})
                ]);
                
                // Import new data
                if (importData.users && Object.keys(importData.users).length > 0) {
                    const users = Object.entries(importData.users).map(([userId, userData]) => ({
                        ...userData,
                        userId
                    }));
                    await this.db.collection('users').insertMany(users);
                }
                
                if (importData.economy && Object.keys(importData.economy).length > 0) {
                    const economy = Object.entries(importData.economy).map(([userId, economyData]) => ({
                        ...economyData,
                        userId
                    }));
                    await this.db.collection('economy').insertMany(economy);
                }
                
                if (importData.groups && Object.keys(importData.groups).length > 0) {
                    const groups = Object.entries(importData.groups).map(([groupId, groupData]) => ({
                        ...groupData,
                        groupId
                    }));
                    await this.db.collection('groups').insertMany(groups);
                }
                
                if (importData.settings && Object.keys(importData.settings).length > 0) {
                    const settings = Object.entries(importData.settings).map(([key, value]) => ({
                        key,
                        value,
                        importedAt: Date.now()
                    }));
                    await this.db.collection('settings').insertMany(settings);
                }
                
                if (importData.attendance && Object.keys(importData.attendance).length > 0) {
                    const attendance = Object.entries(importData.attendance).map(([userId, attendanceData]) => ({
                        ...attendanceData,
                        userId
                    }));
                    await this.db.collection('attendance').insertMany(attendance);
                }
                
                if (importData.stats) {
                    await this.db.collection('stats').replaceOne(
                        { _id: 'global' },
                        { ...importData.stats, _id: 'global', importedAt: Date.now() },
                        { upsert: true }
                    );
                }
            });
            
            await session.endSession();
            
            // Clear cache after import
            this.cache.clear();
            
            logger.info('✅ Data imported successfully to MongoDB');
            return true;
            
        } catch (error) {
            logger.error('❌ Error importing data:', error.message);
            return false;
        }
    }
    
    async shutdown() {
        try {
            this.cache.clear();
            
            if (this.client) {
                await this.client.close();
                this.isConnected = false;
                logger.info('🔄 Database connection closed');
            }
        } catch (error) {
            logger.error('Error during shutdown:', error.message);
        }
    }
    
    // Health check
    async healthCheck() {
        try {
            if (this.useFallback) {
                return { status: 'fallback', message: 'Using in-memory storage' };
            }
            
            if (!this.isConnected) {
                return { status: 'disconnected', message: 'Not connected to database' };
            }
            
            await this.db.admin().ping();
            return { status: 'connected', message: 'Database connection is healthy' };
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }
}

// Create singleton instance
export const database = new ExternalDatabase();

// Helper functions for easy access
export const db = {
    // Connection status
    get isConnected() {
        return database.isConnected;
    },
    
    get useFallback() {
        return database.useFallback;
    },
    
    // User functions
    getUser: (userId) => database.getUser(userId),
    saveUser: (userId, userData) => database.saveUser(userId, userData),
    getAllUsers: () => database.getAllUsers(),
    
    // Economy functions
    getEconomy: (userId) => database.getEconomy(userId),
    saveEconomy: (userId, economyData) => database.saveEconomy(userId, economyData),
    getAllEconomyProfiles: () => database.getAllEconomyProfiles(),
    
    // Attendance functions
    getAttendance: (userId) => database.getAttendance(userId),
    saveAttendance: (userId, attendanceData) => database.saveAttendance(userId, attendanceData),
    
    // Group functions
    getGroup: (groupId) => database.getGroup(groupId),
    saveGroup: (groupId, groupData) => database.saveGroup(groupId, groupData),
    getAllGroups: () => database.getAllGroups(),
    
    // Settings functions
    getSetting: (key) => database.getSetting(key),
    setSetting: (key, value) => database.setSetting(key, value),
    getAllSettings: () => database.getAllSettings(),
    
    // Statistics functions
    incrementCommandCount: () => database.incrementCommandCount(),
    incrementMessageCount: () => database.incrementMessageCount(),
    getStats: () => database.getStats(),
    
    // Data management
    exportData: () => database.exportData(),
    importData: (data) => database.importData(data),
    
    // Health and connection management
    healthCheck: () => database.healthCheck(),
    shutdown: () => database.shutdown(),
    
    // Additional utility methods
    ensureConnection: () => database.ensureConnection()
};

// Graceful shutdown handler
process.on('SIGTERM', async () => {
    logger.info('🔄 Received SIGTERM, closing database connections...');
    await database.shutdown();
});

process.on('SIGINT', async () => {
    logger.info('🔄 Received SIGINT, closing database connections...');
    await database.shutdown();
    process.exit(0);
});
