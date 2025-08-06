import { isOwner, isAdmin } from '../utils/helpers.js';
import { sessionManager } from '../utils/sessionManager.js';
import { config } from '../config/config.js';

export default {
    name: 'session',
    description: 'Manage WhatsApp login sessions',
    usage: '!session [save|load|delete|list|status|clean]',
    category: 'admin',
    
    async execute(context) {
        const { reply, args, senderId } = context;
        
        // Check permissions - owner and admins can manage sessions
        if (!isOwner(senderId) && !isAdmin(senderId)) {
            await reply('❌ Only admins and owners can manage sessions.');
            return;
        }
        
        if (args.length === 0) {
            await this.showSessionMenu(reply);
            return;
        }
        
        const subcommand = args[0].toLowerCase();
        
        switch (subcommand) {
            case 'save':
                await this.saveSession(reply);
                break;
            case 'load':
                await this.loadSession(reply);
                break;
            case 'delete':
                await this.deleteSession(reply, senderId);
                break;
            case 'list':
                await this.listSessions(reply, senderId);
                break;
            case 'status':
                await this.showStatus(reply);
                break;
            case 'clean':
                await this.cleanSessions(reply, senderId);
                break;
            case 'info':
                await this.showInfo(reply);
                break;
            default:
                await reply(`❌ Unknown session command: *${subcommand}*\n\nUse *${config.PREFIX}session* to see available commands.`);
        }
    },
    
    async showSessionMenu(reply) {
        const menuText = `📱 *Session Management*\n\n` +
                        `🔐 *Available Commands:*\n\n` +
                        `• *save* - Save current session to MongoDB\n` +
                        `• *load* - Load session from MongoDB\n` +
                        `• *delete* - Delete saved session ⚠️\n` +
                        `• *list* - List all saved sessions\n` +
                        `• *status* - Check session status\n` +
                        `• *clean* - Clean old sessions (owner only)\n` +
                        `• *info* - Session system information\n\n` +
                        `💡 *Usage:* ${config.PREFIX}session [command]\n\n` +
                        `⚠️ *Note:* Session management affects bot login state.`;
        
        await reply(menuText);
    },
    
    async saveSession(reply) {
        try {
            await reply('💾 Saving current session to MongoDB...');
            
            const success = await sessionManager.saveSession();
            
            if (success) {
                const statusText = `✅ *Session Saved Successfully!*\n\n` +
                                  `📁 *Session ID:* \`${config.SESSION_ID}\`\n` +
                                  `💾 *Storage:* MongoDB\n` +
                                  `📅 *Saved:* ${new Date().toLocaleString()}\n\n` +
                                  `🔄 *Benefits:*\n` +
                                  `• No re-pairing needed after restarts\n` +
                                  `• Survives redeployments\n` +
                                  `• Automatic backup every 5 minutes\n\n` +
                                  `✨ Your bot will now persist across deployments!`;
                
                await reply(statusText);
            } else {
                await reply('❌ Failed to save session. Check if MongoDB is connected and session files exist.');
            }
            
        } catch (error) {
            await reply(`❌ Error saving session: ${error.message}`);
        }
    },
    
    async loadSession(reply) {
        try {
            await reply('📥 Loading session from MongoDB...');
            
            const success = await sessionManager.loadSession();
            
            if (success) {
                const statusText = `✅ *Session Loaded Successfully!*\n\n` +
                                  `📁 *Session ID:* \`${config.SESSION_ID}\`\n` +
                                  `📥 *Loaded from:* MongoDB\n` +
                                  `📅 *Loaded:* ${new Date().toLocaleString()}\n\n` +
                                  `⚠️ *Important:*\n` +
                                  `• Restart the bot to use the loaded session\n` +
                                  `• This will replace current session files\n\n` +
                                  `🔄 Use *${config.PREFIX}admin restart* to apply changes.`;
                
                await reply(statusText);
            } else {
                await reply('❌ No session found in MongoDB or failed to load session.');
            }
            
        } catch (error) {
            await reply(`❌ Error loading session: ${error.message}`);
        }
    },
    
    async deleteSession(reply, senderId) {
        // Only owner can delete sessions
        if (!isOwner(senderId)) {
            await reply('❌ Only the bot owner can delete sessions.');
            return;
        }
        
        try {
            await reply('🗑️ Deleting session from MongoDB and local storage...');
            
            const success = await sessionManager.deleteSession();
            
            if (success) {
                const statusText = `✅ *Session Deleted Successfully!*\n\n` +
                                  `🗑️ *Removed:*\n` +
                                  `• MongoDB session data\n` +
                                  `• Local session files\n\n` +
                                  `⚠️ *Important:*\n` +
                                  `• Bot will need to re-pair on next restart\n` +
                                  `• Pairing code will be sent to: ${config.PAIRING_NUMBER}\n\n` +
                                  `🔄 Restart bot to trigger new pairing process.`;
                
                await reply(statusText);
            } else {
                await reply('❌ Failed to delete session completely. Some files may remain.');
            }
            
        } catch (error) {
            await reply(`❌ Error deleting session: ${error.message}`);
        }
    },
    
    async listSessions(reply, senderId) {
        // Only owner can see all sessions
        if (!isOwner(senderId)) {
            await reply('❌ Only the bot owner can list all sessions.');
            return;
        }
        
        try {
            const sessions = await sessionManager.listSessions();
            
            if (sessions.length === 0) {
                await reply('📭 No sessions found in MongoDB.');
                return;
            }
            
            let listText = `📋 *Saved Sessions* (${sessions.length})\n\n`;
            
            sessions.forEach((session, index) => {
                const isCurrentSession = session.sessionId === config.SESSION_ID;
                listText += `${index + 1}. \`${session.sessionId}\` ${isCurrentSession ? '← Current' : ''}\n`;
                listText += `   📅 ${new Date(session.lastSaved).toLocaleString()}\n`;
                listText += `   🤖 ${session.botName || 'Unknown Bot'}\n\n`;
            });
            
            listText += `💡 Use *${config.PREFIX}session load* to restore a session`;
            
            await reply(listText);
            
        } catch (error) {
            await reply(`❌ Error listing sessions: ${error.message}`);
        }
    },
    
    async showStatus(reply) {
        try {
            const isMongoConnected = sessionManager.isConnected;
            const persistenceEnabled = config.PERSIST_SESSIONS;
            
            const statusText = `📊 *Session System Status*\n\n` +
                              `🔗 *MongoDB Connection:* ${isMongoConnected ? '✅ Connected' : '❌ Disconnected'}\n` +
                              `💾 *Persistence:* ${persistenceEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                              `📱 *Pairing Number:* \`${config.PAIRING_NUMBER}\`\n` +
                              `👑 *Owner Number:* \`${config.OWNER_NUMBER}\`\n` +
                              `🆔 *Session ID:* \`${config.SESSION_ID}\`\n\n` +
                              `⚙️ *Configuration:*\n` +
                              `• Auto-save: ${persistenceEnabled && isMongoConnected ? 'Every 5 minutes' : 'Disabled'}\n` +
                              `• Environment: ${config.NODE_ENV}\n` +
                              `• Use Pairing Code: ${config.USE_PAIRING_CODE ? 'Yes' : 'No'}\n\n` +
                              `${!isMongoConnected ? 
                                `⚠️ *Warning:* MongoDB not connected. Sessions won't persist across deployments.` :
                                `✅ *All systems operational!*`}`;
            
            await reply(statusText);
            
        } catch (error) {
            await reply(`❌ Error getting session status: ${error.message}`);
        }
    },
    
    async cleanSessions(reply, senderId) {
        // Only owner can clean sessions
        if (!isOwner(senderId)) {
            await reply('❌ Only the bot owner can clean old sessions.');
            return;
        }
        
        try {
            await reply('🧹 Cleaning old sessions (older than 30 days)...');
            
            await sessionManager.cleanupOldSessions(30);
            
            const cleanText = `✅ *Session Cleanup Completed!*\n\n` +
                             `🧹 *Actions Performed:*\n` +
                             `• Removed sessions older than 30 days\n` +
                             `• Current session preserved\n` +
                             `• MongoDB storage optimized\n\n` +
                             `💡 Regular cleanup helps maintain optimal performance.`;
            
            await reply(cleanText);
            
        } catch (error) {
            await reply(`❌ Error cleaning sessions: ${error.message}`);
        }
    },
    
    async showInfo(reply) {
        const infoText = `ℹ️ *Session Management Information*\n\n` +
                        `🔐 *What are Sessions?*\n` +
                        `Sessions store your WhatsApp login credentials so the bot doesn't need to pair again after every restart or redeployment.\n\n` +
                        `💾 *How it Works:*\n` +
                        `1. First login: Bot requests pairing code\n` +
                        `2. After successful connection: Session is saved to MongoDB\n` +
                        `3. Future restarts: Bot loads session automatically\n` +
                        `4. Auto-backup: Session is saved every 5 minutes\n\n` +
                        `🔄 *Benefits:*\n` +
                        `• No re-pairing needed after deployments\n` +
                        `• Faster bot startup times\n` +
                        `• Survives server restarts\n` +
                        `• Automatic backup and recovery\n\n` +
                        `⚠️ *Important Notes:*\n` +
                        `• Sessions expire if unused for long periods\n` +
                        `• Logging out of WhatsApp will invalidate sessions\n` +
                        `• Keep your MongoDB connection secure\n\n` +
                        `🛠️ *Troubleshooting:*\n` +
                        `• If bot won't connect: Delete and recreate session\n` +
                        `• If pairing fails: Check PAIRING_NUMBER in config\n` +
                        `• If sessions won't save: Verify MongoDB connection`;
        
        await reply(infoText);
    }
};
