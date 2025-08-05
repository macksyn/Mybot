import { logger } from './logger.js';
import { config } from '../config/config.js';

/**
 * Simple in-memory database for basic bot data
 * In production, you might want to use a real database like PostgreSQL, MongoDB, etc.
 */
class SimpleDatabase {
    constructor() {
        this.data = {
            users: new Map(),
            groups: new Map(),
            settings: new Map(),
            stats: {
                commandsExecuted: 0,
                messagesReceived: 0,
                usersServed: new Set(),
                startTime: Date.now()
            }
        };
        
        this.init();
    }
    
    async init() {
        logger.info('Database initialized (in-memory)');
        
        // Load default settings
        this.data.settings.set('botName', config.BOT_NAME);
        this.data.settings.set('prefix', config.PREFIX);
        this.data.settings.set('timezone', config.TIMEZONE);
    }
    
    // User management
    async getUser(userId) {
        return this.data.users.get(userId) || null;
    }
    
    async saveUser(userId, userData) {
        const existingUser = this.data.users.get(userId) || {};
        const updatedUser = {
            ...existingUser,
            ...userData,
            id: userId,
            lastSeen: Date.now(),
            updatedAt: Date.now()
        };
        
        if (!existingUser.id) {
            updatedUser.createdAt = Date.now();
        }
        
        this.data.users.set(userId, updatedUser);
        return updatedUser;
    }
    
    async getAllUsers() {
        return Array.from(this.data.users.values());
    }
    
    // Group management
    async getGroup(groupId) {
        return this.data.groups.get(groupId) || null;
    }
    
    async saveGroup(groupId, groupData) {
        const existingGroup = this.data.groups.get(groupId) || {};
        const updatedGroup = {
            ...existingGroup,
            ...groupData,
            id: groupId,
            lastActivity: Date.now(),
            updatedAt: Date.now()
        };
        
        if (!existingGroup.id) {
            updatedGroup.createdAt = Date.now();
        }
        
        this.data.groups.set(groupId, updatedGroup);
        return updatedGroup;
    }
    
    async getAllGroups() {
        return Array.from(this.data.groups.values());
    }
    
    // Settings management
    async getSetting(key) {
        return this.data.settings.get(key);
    }
    
    async setSetting(key, value) {
        this.data.settings.set(key, value);
        return value;
    }
    
    async getAllSettings() {
        return Object.fromEntries(this.data.settings);
    }
    
    // Statistics
    async incrementCommandCount() {
        this.data.stats.commandsExecuted++;
    }
    
    async incrementMessageCount() {
        this.data.stats.messagesReceived++;
    }
    
    async addUserToStats(userId) {
        this.data.stats.usersServed.add(userId);
    }
    
    async getStats() {
        return {
            ...this.data.stats,
            usersServed: this.data.stats.usersServed.size,
            uptime: Date.now() - this.data.stats.startTime,
            totalUsers: this.data.users.size,
            totalGroups: this.data.groups.size
        };
    }
    
    // Command history (keep last 100 commands)
    async logCommand(userId, command, timestamp = Date.now()) {
        if (!this.data.commandHistory) {
            this.data.commandHistory = [];
        }
        
        this.data.commandHistory.push({
            userId,
            command,
            timestamp
        });
        
        // Keep only last 100 commands
        if (this.data.commandHistory.length > 100) {
            this.data.commandHistory = this.data.commandHistory.slice(-100);
        }
    }
    
    async getCommandHistory(limit = 10) {
        if (!this.data.commandHistory) {
            return [];
        }
        
        return this.data.commandHistory
            .slice(-limit)
            .reverse();
    }
    
    // Data export/import for persistence
    async exportData() {
        return {
            users: Object.fromEntries(this.data.users),
            groups: Object.fromEntries(this.data.groups),
            settings: Object.fromEntries(this.data.settings),
            stats: {
                ...this.data.stats,
                usersServed: Array.from(this.data.stats.usersServed)
            },
            commandHistory: this.data.commandHistory || [],
            exportedAt: Date.now()
        };
    }
    
    async importData(importData) {
        try {
            if (importData.users) {
                this.data.users = new Map(Object.entries(importData.users));
            }
            
            if (importData.groups) {
                this.data.groups = new Map(Object.entries(importData.groups));
            }
            
            if (importData.settings) {
                this.data.settings = new Map(Object.entries(importData.settings));
            }
            
            if (importData.stats) {
                this.data.stats = {
                    ...importData.stats,
                    usersServed: new Set(importData.stats.usersServed || [])
                };
            }
            
            if (importData.commandHistory) {
                this.data.commandHistory = importData.commandHistory;
            }
            
            logger.info('Database data imported successfully');
            return true;
            
        } catch (error) {
            logger.error('Error importing database data:', error);
            return false;
        }
    }
    
    // Clear all data (use with caution)
    async clearAllData() {
        this.data = {
            users: new Map(),
            groups: new Map(),
            settings: new Map(),
            stats: {
                commandsExecuted: 0,
                messagesReceived: 0,
                usersServed: new Set(),
                startTime: Date.now()
            }
        };
        
        await this.init();
        logger.warn('All database data cleared');
    }
}

// Create singleton instance
export const database = new SimpleDatabase();

// Helper functions for easy access
export const db = {
    // User functions
    getUser: (userId) => database.getUser(userId),
    saveUser: (userId, userData) => database.saveUser(userId, userData),
    getAllUsers: () => database.getAllUsers(),
    
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
    addUserToStats: (userId) => database.addUserToStats(userId),
    getStats: () => database.getStats(),
    
    // Command history
    logCommand: (userId, command) => database.logCommand(userId, command),
    getCommandHistory: (limit) => database.getCommandHistory(limit),
    
    // Data management
    exportData: () => database.exportData(),
    importData: (data) => database.importData(data),
    clearAllData: () => database.clearAllData()
};
