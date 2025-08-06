// External Database Solution using MongoDB Atlas (Free Tier)
import { MongoClient } from 'mongodb';
import { logger } from './logger.js';
import { config } from '../config/config.js';

/**
 * MongoDB-based persistent storage for free hosting platforms
 * Uses MongoDB Atlas free tier (512MB storage)
 */
class ExternalDatabase {
    constructor() {
        this.client = null;
        this.db = null;
        this.isConnected = false;
        this.connectionString = process.env.MONGODB_URI || process.env.DATABASE_URL;
        
        if (!this.connectionString) {
            throw new Error('MONGODB_URI or DATABASE_URL environment variable is required');
        }
        
        this.init();
    }
    
    async init() {
        try {
            this.client = new MongoClient(this.connectionString, {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });
            
            await this.client.connect();
            this.db = this.client.db('whatsapp_bot');
            this.isConnected = true;
            
            // Create indexes for better performance
            await this.createIndexes();
            
            logger.info('✅ Connected to external MongoDB database');
            
        } catch (error) {
            logger.error('❌ Failed to connect to external database:', error);
            throw error;
        }
    }
    
    async createIndexes() {
        try {
            // Create indexes for better query performance
            await this.db.collection('users').createIndex({ userId: 1 }, { unique: true });
            await this.db.collection('economy').createIndex({ userId: 1 }, { unique: true });
            await this.db.collection('attendance').createIndex({ userId: 1 });
            await this.db.collection('groups').createIndex({ groupId: 1 }, { unique: true });
            
            logger.debug('📚 Database indexes created');
        } catch (error) {
            logger.warn('Could not create indexes:', error.message);
        }
    }
    
    async ensureConnection() {
        if (!this.isConnected) {
            await this.init();
        }
        return this.isConnected;
    }
    
    // User management
    async getUser(userId) {
        await this.ensureConnection();
        try {
            return await this.db.collection('users').findOne({ userId });
        } catch (error) {
            logger.error('Error getting user:', error);
            return null;
        }
    }
    
    async saveUser(userId, userData) {
        await this.ensureConnection();
        try {
            const updatedUser = {
                ...userData,
                userId,
                lastSeen: Date.now(),
                updatedAt: Date.now()
            };
            
            const result = await this.db.collection('users').replaceOne(
                { userId },
                updatedUser,
                { upsert: true }
            );
            
            return updatedUser;
        } catch (error) {
            logger.error('Error saving user:', error);
            throw error;
        }
    }
    
    async getAllUsers() {
        await this.ensureConnection();
        try {
            return await this.db.collection('users').find({}).toArray();
        } catch (error) {
            logger.error('Error getting all users:', error);
            return [];
        }
    }
    
    // Economy management
    async getEconomy(userId) {
        await this.ensureConnection();
        try {
            return await this.db.collection('economy').findOne({ userId });
        } catch (error) {
            logger.error('Error getting economy data:', error);
            return null;
        }
    }
    
    async saveEconomy(userId, economyData) {
        await this.ensureConnection();
        try {
            const updated = {
                ...economyData,
                userId,
                lastUpdated: Date.now()
            };
            
            await this.db.collection('economy').replaceOne(
                { userId },
                updated,
                { upsert: true }
            );
            
            return updated;
        } catch (error) {
            logger.error('Error saving economy data:', error);
            throw error;
        }
    }
    
    async getAllEconomyProfiles() {
        await this.ensureConnection();
        try {
            return await this.db.collection('economy').find({}).toArray();
        } catch (error) {
            logger.error('Error getting economy profiles:', error);
            return [];
        }
    }
    
    // Attendance management
    async getAttendance(userId) {
        await this.ensureConnection();
        try {
            return await this.db.collection('attendance').findOne({ userId });
        } catch (error) {
            logger.error('Error getting attendance:', error);
            return null;
        }
    }
    
    async saveAttendance(userId, attendanceData) {
        await this.ensureConnection();
        try {
            const updated = {
                ...attendanceData,
                userId,
                lastUpdated: Date.now()
            };
            
            await this.db.collection('attendance').replaceOne(
                { userId },
                updated,
                { upsert: true }
            );
            
            return updated;
        } catch (error) {
            logger.error('Error saving attendance:', error);
            throw error;
        }
    }
    
    // Group management
    async getGroup(groupId) {
        await this.ensureConnection();
        try {
            return await this.db.collection('groups').findOne({ groupId });
        } catch (error) {
            logger.error('Error getting group:', error);
            return null;
        }
    }
    
    async saveGroup(groupId, groupData) {
        await this.ensureConnection();
        try {
            const updated = {
                ...groupData,
                groupId,
                lastActivity: Date.now(),
                updatedAt: Date.now()
            };
            
            await this.db.collection('groups').replaceOne(
                { groupId },
                updated,
                { upsert: true }
            );
            
            return updated;
        } catch (error) {
            logger.error('Error saving group:', error);
            throw error;
        }
    }
    
    // Settings management
    async getSetting(key) {
        await this.ensureConnection();
        try {
            const result = await this.db.collection('settings').findOne({ key });
            return result?.value || null;
        } catch (error) {
            logger.error('Error getting setting:', error);
            return null;
        }
    }
    
    async setSetting(key, value) {
        await this.ensureConnection();
        try {
            await this.db.collection('settings').replaceOne(
                { key },
                { key, value, updatedAt: Date.now() },
                { upsert: true }
            );
            return value;
        } catch (error) {
            logger.error('Error setting value:', error);
            throw error;
        }
    }
    
    async getAllSettings() {
        await this.ensureConnection();
        try {
            const settings = await this.db.collection('settings').find({}).toArray();
            const result = {};
            settings.forEach(setting => {
                result[setting.key] = setting.value;
            });
            return result;
        } catch (error) {
            logger.error('Error getting all settings:', error);
            return {};
        }
    }
    
    // Statistics
    async getStats() {
        await this.ensureConnection();
        try {
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
            logger.error('Error getting stats:', error);
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
        await this.ensureConnection();
        try {
            await this.db.collection('stats').updateOne(
                { _id: 'global' },
                { 
                    $inc: { commandsExecuted: 1 },
                    $set: { lastCommandAt: Date.now() }
                },
                { upsert: true }
            );
        } catch (error) {
            logger.error('Error incrementing command count:', error);
        }
    }
    
    async incrementMessageCount() {
        await this.ensureConnection();
        try {
            await this.db.collection('stats').updateOne(
                { _id: 'global' },
                { 
                    $inc: { messagesReceived: 1 },
                    $set: { lastMessageAt: Date.now() }
                },
                { upsert: true }
            );
        } catch (error) {
            logger.error('Error incrementing message count:', error);
        }
    }
    
    // Data export/import for migration
    async exportData() {
        await this.ensureConnection();
        try {
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
            logger.error('Error exporting data:', error);
            throw error;
        }
    }
    
    async importData(importData) {
        await this.ensureConnection();
        try {
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
            logger.info('✅ Data imported successfully to external database');
            return true;
            
        } catch (error) {
            logger.error('❌ Error importing data:', error);
            return false;
        }
    }
    
    async shutdown() {
        if (this.client) {
            await this.client.close();
            this.isConnected = false;
            logger.info('🔄 External database connection closed');
        }
    }
}

// Create singleton instance
export const database = new ExternalDatabase();

// Helper functions for easy access
export const db = {
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
    
    // Connection management
    shutdown: () => database.shutdown()
};
