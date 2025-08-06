import { MongoClient } from 'mongodb';
import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';
import { config } from '../config/config.js';

/**
 * ENHANCED MongoDB-based session management for WhatsApp bot
 * Fixed version to prevent session conflicts and immediate logouts
 */
export class SessionManager {
    constructor() {
        this.client = null;
        this.db = null;
        this.isConnected = false;
        this.sessionCollection = 'whatsapp_sessions';
        this.localSessionPath = './sessions';
        this.connectionString = config.MONGODB_URI;
        this.isInitializing = false;
        this.autoSaveInterval = null;
        
        if (this.connectionString) {
            this.init();
        } else {
            logger.warn('⚠️  No MongoDB URI provided. Sessions will not persist across deployments.');
        }
    }
    
    async init() {
        if (this.isInitializing) return;
        this.isInitializing = true;
        
        try {
            this.client = new MongoClient(this.connectionString, {
                maxPoolSize: 5,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                // FIXED: Better connection options
                connectTimeoutMS: 10000,
                heartbeatFrequencyMS: 10000,
            });
            
            await this.client.connect();
            this.db = this.client.db('whatsapp_bot');
            this.isConnected = true;
            
            logger.info('✅ Session manager connected to MongoDB');
            
            // Create index for efficient queries
            await this.db.collection(this.sessionCollection).createIndex({ sessionId: 1 }, { unique: true });
            
        } catch (error) {
            logger.error('❌ Failed to connect session manager to MongoDB:', error.message);
            this.isConnected = false;
        } finally {
            this.isInitializing = false;
        }
    }
    
    /**
     * FIXED: Save session to MongoDB with validation
     */
    async saveSession(sessionId = config.SESSION_ID) {
        if (!this.isConnected || !config.PERSIST_SESSIONS) {
            logger.debug('Session persistence disabled or MongoDB not available');
            return false;
        }
        
        try {
            // FIXED: Validate session files before saving
            const sessionFiles = await this.readLocalSession();
            
            if (!sessionFiles || Object.keys(sessionFiles).length === 0) {
                logger.debug('No valid session files found to save');
                return false;
            }
            
            // FIXED: Validate session content
            const requiredFiles = ['creds.json'];
            const hasRequiredFiles = requiredFiles.some(file => sessionFiles[file]);
            
            if (!hasRequiredFiles) {
                logger.warn('⚠️ Session files incomplete, skipping save');
                return false;
            }
            
            const sessionData = {
                sessionId,
                files: sessionFiles,
                lastSaved: new Date(),
                botName: config.BOT_NAME,
                version: '2.1.0', // Updated version
                fileCount: Object.keys(sessionFiles).length
            };
            
            await this.db.collection(this.sessionCollection).replaceOne(
                { sessionId },
                sessionData,
                { upsert: true }
            );
            
            logger.info(`💾 Session saved to MongoDB: ${sessionId} (${sessionData.fileCount} files)`);
            return true;
        } catch (error) {
            logger.error('❌ Error saving session to MongoDB:', error.message);
            return false;
        }
    }
    
    /**
     * FIXED: Load session from MongoDB with better validation
     */
    async loadSession(sessionId = config.SESSION_ID) {
        if (!this.isConnected || !config.PERSIST_SESSIONS) {
            logger.debug('Session persistence disabled or MongoDB not available');
            return false;
        }
        
        try {
            const sessionData = await this.db.collection(this.sessionCollection).findOne({ sessionId });
            
            if (!sessionData || !sessionData.files) {
                logger.info('📭 No existing session found in MongoDB');
                return false;
            }
            
            // FIXED: Validate session data before writing
            if (!sessionData.files['creds.json']) {
                logger.warn('⚠️ Invalid session data in MongoDB (missing credentials)');
                return false;
            }
            
            // FIXED: Ensure local session directory exists and is clean
            try {
                await fs.rm(this.localSessionPath, { recursive: true, force: true });
            } catch {
                // Directory doesn't exist, that's fine
            }
            
            await fs.mkdir(this.localSessionPath, { recursive: true });
            
            // FIXED: Write session files with validation
            let filesWritten = 0;
            for (const [filename, content] of Object.entries(sessionData.files)) {
                try {
                    // Validate JSON content
                    if (filename.endsWith('.json')) {
                        JSON.parse(content); // This will throw if invalid
                    }
                    
                    const filePath = path.join(this.localSessionPath, filename);
                    await fs.writeFile(filePath, content);
                    filesWritten++;
                } catch (error) {
                    logger.warn(`Failed to write session file ${filename}:`, error.message);
                }
            }
            
            if (filesWritten === 0) {
                logger.error('❌ Failed to write any session files');
                return false;
            }
            
            logger.info(`📥 Session loaded from MongoDB: ${sessionId} (${filesWritten}/${Object.keys(sessionData.files).length} files)`);
            logger.info(`📅 Session last saved: ${sessionData.lastSaved}`);
            return true;
        } catch (error) {
            logger.error('❌ Error loading session from MongoDB:', error.message);
            return false;
        }
    }
    
    /**
     * FIXED: Read local session files with validation
     */
    async readLocalSession() {
        try {
            const sessionFiles = {};
            
            // Check if session directory exists
            try {
                await fs.access(this.localSessionPath);
            } catch {
                logger.debug('No local session directory found');
                return null;
            }
            
            const files = await fs.readdir(this.localSessionPath);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            if (jsonFiles.length === 0) {
                logger.debug('No session JSON files found');
                return null;
            }
            
            for (const file of jsonFiles) {
                try {
                    const filePath = path.join(this.localSessionPath, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    
                    // FIXED: Validate JSON content
                    JSON.parse(content); // This will throw if invalid
                    sessionFiles[file] = content;
                } catch (error) {
                    logger.warn(`Skipping invalid session file ${file}:`, error.message);
                }
            }
            
            return Object.keys(sessionFiles).length > 0 ? sessionFiles : null;
        } catch (error) {
            logger.error('Error reading local session:', error.message);
            return null;
        }
    }
    
    /**
     * FIXED: Delete session from both local and MongoDB
     */
    async deleteSession(sessionId = config.SESSION_ID) {
        try {
            let mongoDeleted = false;
            let localDeleted = false;
            
            // Delete from MongoDB
            if (this.isConnected) {
                const result = await this.db.collection(this.sessionCollection).deleteOne({ sessionId });
                mongoDeleted = result.deletedCount > 0;
                logger.info(`🗑️ Session ${mongoDeleted ? 'deleted' : 'not found'} in MongoDB: ${sessionId}`);
            }
            
            // Delete local session files
            try {
                await fs.rm(this.localSessionPath, { recursive: true, force: true });
                localDeleted = true;
                logger.info('🗑️ Local session directory removed');
            } catch (error) {
                logger.debug('No local session files to delete');
            }
            
            return mongoDeleted || localDeleted;
        } catch (error) {
            logger.error('Error deleting session:', error.message);
            return false;
        }
    }
    
    /**
     * List all sessions in MongoDB
     */
    async listSessions() {
        if (!this.isConnected) {
            return [];
        }
        
        try {
            const sessions = await this.db.collection(this.sessionCollection)
                .find({}, { projection: { sessionId: 1, lastSaved: 1, botName: 1, fileCount: 1 } })
                .sort({ lastSaved: -1 })
                .toArray();
            
            return sessions;
        } catch (error) {
            logger.error('Error listing sessions:', error.message);
            return [];
        }
    }
    
    /**
     * FIXED: Auto-save session periodically with better error handling
     */
    startAutoSave(interval = 300000) { // 5 minutes default
        if (!this.isConnected || !config.PERSIST_SESSIONS) {
            logger.debug('Auto-save not started: MongoDB not connected or persistence disabled');
            return;
        }
        
        // Clear existing interval if any
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        
        logger.info(`🔄 Auto-save started (every ${interval/1000}s)`);
        
        this.autoSaveInterval = setInterval(async () => {
            try {
                const success = await this.saveSession();
                if (!success) {
                    logger.debug('Auto-save skipped: no valid session to save');
                }
            } catch (error) {
                logger.error('Auto-save error:', error.message);
                
                // If MongoDB connection lost, try to reconnect
                if (!this.isConnected) {
                    logger.info('🔄 Attempting to reconnect MongoDB for auto-save...');
                    await this.init();
                }
            }
        }, interval);
    }
    
    /**
     * FIXED: Cleanup old sessions with better error handling
     */
    async cleanupOldSessions(olderThanDays = 30) {
        if (!this.isConnected) {
            logger.warn('Cannot cleanup: MongoDB not connected');
            return;
        }
        
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
            
            // Don't delete current session
            const result = await this.db.collection(this.sessionCollection).deleteMany({
                lastSaved: { $lt: cutoffDate },
                sessionId: { $ne: config.SESSION_ID }
            });
            
            if (result.deletedCount > 0) {
                logger.info(`🧹 Cleaned up ${result.deletedCount} old sessions (older than ${olderThanDays} days)`);
            } else {
                logger.info('🧹 No old sessions found to clean up');
            }
        } catch (error) {
            logger.error('Error cleaning up old sessions:', error.message);
        }
    }
    
    async shutdown() {
        try {
            // Clear auto-save interval
            if (this.autoSaveInterval) {
                clearInterval(this.autoSaveInterval);
                this.autoSaveInterval = null;
            }
            
            // Save current session before shutdown
            await this.saveSession();
            
            if (this.client) {
                await this.client.close();
                this.isConnected = false;
                logger.info('🔄 Session manager connection closed');
            }
        } catch (error) {
            logger.error('Error during session manager shutdown:', error.message);
        }
    }
}

// Create singleton instance
export const sessionManager = new SessionManager();
