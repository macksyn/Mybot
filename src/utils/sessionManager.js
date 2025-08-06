import { MongoClient } from 'mongodb';
import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';
import { config } from '../config/config.js';

/**
 * SIMPLE MongoDB Session Manager
 * Just saves and loads session files - nothing fancy
 */
export class SessionManager {
    constructor() {
        this.client = null;
        this.db = null;
        this.isConnected = false;
        this.connectionString = config.MONGODB_URI;
        
        if (this.connectionString) {
            this.init();
        } else {
            logger.warn('⚠️ No MongoDB URI - sessions will not persist across deployments');
        }
    }
    
    async init() {
        try {
            this.client = new MongoClient(this.connectionString, {
                maxPoolSize: 5,
                serverSelectionTimeoutMS: 5000,
            });
            
            await this.client.connect();
            this.db = this.client.db('whatsapp_bot');
            this.isConnected = true;
            
            logger.info('✅ Session manager connected to MongoDB');
            
        } catch (error) {
            logger.error('❌ MongoDB connection failed:', error.message);
            this.isConnected = false;
        }
    }
    
    /**
     * Save all session files to MongoDB
     */
    async saveSession(sessionId = config.SESSION_ID || 'default') {
        if (!this.isConnected) {
            logger.debug('MongoDB not connected, skipping session save');
            return false;
        }
        
        try {
            const sessionFiles = {};
            
            // Read all files from sessions directory
            const files = await fs.readdir('./sessions');
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const content = await fs.readFile(path.join('./sessions', file), 'utf8');
                    sessionFiles[file] = content;
                }
            }
            
            if (Object.keys(sessionFiles).length === 0) {
                logger.debug('No session files to save');
                return false;
            }
            
            // Save to MongoDB
            await this.db.collection('sessions').replaceOne(
                { sessionId },
                {
                    sessionId,
                    files: sessionFiles,
                    savedAt: new Date(),
                    fileCount: Object.keys(sessionFiles).length
                },
                { upsert: true }
            );
            
            logger.info(`💾 Session saved: ${Object.keys(sessionFiles).length} files`);
            return true;
            
        } catch (error) {
            logger.error('Session save error:', error.message);
            return false;
        }
    }
    
    /**
     * Load session files from MongoDB
     */
    async loadSession(sessionId = config.SESSION_ID || 'default') {
        if (!this.isConnected) {
            logger.debug('MongoDB not connected, cannot load session');
            return false;
        }
        
        try {
            const sessionData = await this.db.collection('sessions').findOne({ sessionId });
            
            if (!sessionData || !sessionData.files) {
                logger.info('No saved session found');
                return false;
            }
            
            // Create sessions directory
            await fs.mkdir('./sessions', { recursive: true });
            
            // Write all session files
            let filesWritten = 0;
            for (const [filename, content] of Object.entries(sessionData.files)) {
                try {
                    await fs.writeFile(path.join('./sessions', filename), content);
                    filesWritten++;
                } catch (error) {
                    logger.warn(`Failed to write ${filename}:`, error.message);
                }
            }
            
            if (filesWritten > 0) {
                logger.info(`📥 Session loaded: ${filesWritten} files`);
                return true;
            } else {
                logger.error('Failed to write session files');
                return false;
            }
            
        } catch (error) {
            logger.error('Session load error:', error.message);
            return false;
        }
    }
    
    /**
     * Delete session from both MongoDB and local
     */
    async deleteSession(sessionId = config.SESSION_ID || 'default') {
        try {
            // Delete from MongoDB
            if (this.isConnected) {
                await this.db.collection('sessions').deleteOne({ sessionId });
                logger.info('🗑️ Session deleted from MongoDB');
            }
            
            // Delete local files
            try {
                await fs.rm('./sessions', { recursive: true, force: true });
                logger.info('🗑️ Local session files deleted');
            } catch (error) {
                logger.debug('No local session files to delete');
            }
            
            return true;
            
        } catch (error) {
            logger.error('Session delete error:', error.message);
            return false;
        }
    }
    
    async shutdown() {
        try {
            if (this.client) {
                await this.client.close();
                this.isConnected = false;
                logger.info('🔄 Session manager closed');
            }
        } catch (error) {
            logger.error('Session manager shutdown error:', error.message);
        }
    }
}

// Create singleton
export const sessionManager = new SessionManager();
