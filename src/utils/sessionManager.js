import { MongoClient } from 'mongodb';
import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';
import { config } from '../config/config.js';

/**
 * MongoDB-based session management for WhatsApp bot
 * Stores sessions in MongoDB to persist across deployments
 */
export class SessionManager {
    constructor() {
        this.client = null;
        this.db = null;
        this.isConnected = false;
        this.sessionCollection = 'whatsapp_sessions';
        this.localSessionPath = './sessions';
        this.connectionString = config.MONGODB_URI;
        
        if (this.connectionString) {
            this.init();
        } else {
            logger.warn('⚠️  No MongoDB URI provided. Sessions will not persist across deployments.');
        }
    }
    
    async init() {
        try {
            this.client = new MongoClient(this.connectionString, {
                maxPoolSize: 5,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
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
        }
    }
    
    /**
     * Save session to MongoDB
     */
    async saveSession(sessionId = config.SESSION_ID) {
        if (!this.isConnected || !config.PERSIST_SESSIONS) {
            logger.debug('Session persistence disabled or MongoDB not available');
            return;
        }
        
        try {
            // Read all session files from local storage
            const sessionFiles = await this.readLocalSession();
            
            if (sessionFiles && Object.keys(sessionFiles).length > 0) {
                const sessionData = {
                    sessionId,
                    files: sessionFiles,
                    lastSaved: new Date(),
                    botName: config.BOT_NAME,
                    version: '2.0.0'
                };
                
                await this.db.collection(this.sessionCollection).replaceOne(
                    { sessionId },
                    sessionData,
                    { upsert: true }
                );
                
                logger.info(`💾 Session saved to MongoDB: ${sessionId}`);
                return true;
            }
        } catch (error) {
            logger.error('❌ Error saving session to MongoDB:', error.message);
        }
        
        return false;
    }
    
    /**
     * Load session from MongoDB
     */
    async loadSession(sessionId = config.SESSION_ID) {
        if (!this.isConnected || !config.PERSIST_SESSIONS) {
            logger.debug('Session persistence disabled or MongoDB not available');
            return false;
        }
        
        try {
            const sessionData = await this.db.collection(this.sessionCollection).findOne({ sessionId });
            
            if (sessionData && sessionData.files) {
                // Ensure local session directory exists
                await fs.mkdir(this.localSessionPath, { recursive: true });
                
                // Write session files to local storage
                for (const [filename, content] of Object.entries(sessionData.files)) {
                    const filePath = path.join(this.localSessionPath, filename);
                    await fs.writeFile(filePath, content);
                }
                
                logger.info(`📥 Session loaded from MongoDB: ${sessionId} (${Object.keys(sessionData.files).length} files)`);
                logger.info(`📅 Session last saved: ${sessionData.lastSaved}`);
                return true;
            } else {
                logger.info('📭 No existing session found in MongoDB');
                return false;
            }
        } catch (error) {
            logger.error('❌ Error loading session from MongoDB:', error.message);
        }
        
        return false;
    }
    
    /**
     * Read local session files
     */
    async readLocalSession() {
        try {
            const sessionFiles = {};
            
            // Check if session directory exists
            try {
                await fs.access(this.localSessionPath);
            } catch {
                return null;
            }
            
            const files = await fs.readdir(this.localSessionPath);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.localSessionPath, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    sessionFiles[file] = content;
                }
            }
            
            return Object.keys(sessionFiles).length > 0 ? sessionFiles : null;
        } catch (error) {
            logger.error('Error reading local session:', error.message);
            return null;
        }
    }
    
    /**
     * Delete session from both local and MongoDB
     */
    async deleteSession(sessionId = config.SESSION_ID) {
        try {
            // Delete from MongoDB
            if (this.isConnected) {
                await this.db.collection(this.sessionCollection).deleteOne({ sessionId });
                logger.info(`🗑️ Session deleted from MongoDB: ${sessionId}`);
            }
            
            // Delete local session files
            try {
                const files = await fs.readdir(this.localSessionPath);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        await fs.unlink(path.join(this.localSessionPath, file));
                    }
                }
                logger.info('🗑️ Local session files deleted');
            } catch (error) {
                logger.debug('No local session files to delete');
            }
            
            return true;
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
                .find({}, { projection: { sessionId: 1, lastSaved: 1, botName: 1 } })
                .toArray();
            
            return sessions;
        } catch (error) {
            logger.error('Error listing sessions:', error.message);
            return [];
        }
    }
    
    /**
     * Auto-save session periodically
     */
    startAutoSave(interval = 300000) { // 5 minutes default
        if (!this.isConnected || !config.PERSIST_SESSIONS) {
            return;
        }
        
        logger.info(`🔄 Auto-save started (every ${interval/1000}s)`);
        
        setInterval(async () => {
            try {
                await this.saveSession();
            } catch (error) {
                logger.error('Auto-save error:', error.message);
            }
        }, interval);
    }
    
    /**
     * Cleanup old sessions
     */
    async cleanupOldSessions(olderThanDays = 30) {
        if (!this.isConnected) {
            return;
        }
        
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
            
            const result = await this.db.collection(this.sessionCollection).deleteMany({
                lastSaved: { $lt: cutoffDate }
            });
            
            if (result.deletedCount > 0) {
                logger.info(`🧹 Cleaned up ${result.deletedCount} old sessions`);
            }
        } catch (error) {
            logger.error('Error cleaning up old sessions:', error.message);
        }
    }
    
    async shutdown() {
        try {
            // Save current session before shutdown
            await this.saveSession();
            
            if (this.client) {
                await this.client.close();
                logger.info('🔄 Session manager connection closed');
            }
        } catch (error) {
            logger.error('Error during session manager shutdown:', error.message);
        }
    }
}

// Create singleton instance
export const sessionManager = new SessionManager();
