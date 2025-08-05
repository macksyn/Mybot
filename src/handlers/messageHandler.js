import { logger } from '../utils/logger.js';
import { parseCommand, checkRateLimit, getMessageContent, getSenderId } from '../utils/helpers.js';
import { config } from '../config/config.js';

// Import plugins
import pingPlugin from '../plugins/ping.js';
import helpPlugin from '../plugins/help.js';
import infoPlugin from '../plugins/info.js';
import weatherPlugin from '../plugins/weather.js';
import jokePlugin from '../plugins/joke.js';
import quotePlugin from '../plugins/quote.js';
import calculatorPlugin from '../plugins/calculator.js';
import adminPlugin from '../plugins/admin.js';

export class MessageHandler {
    constructor(sock) {
        this.sock = sock;
        this.plugins = new Map();
        this.loadPlugins();
    }
    
    loadPlugins() {
        // Core plugins (always loaded)
        this.plugins.set('ping', pingPlugin);
        this.plugins.set('help', helpPlugin);
        this.plugins.set('info', infoPlugin);
        
        // Optional plugins based on configuration
        if (config.ENABLE_WEATHER) {
            this.plugins.set('weather', weatherPlugin);
        }
        
        if (config.ENABLE_JOKES) {
            this.plugins.set('joke', jokePlugin);
        }
        
        if (config.ENABLE_QUOTES) {
            this.plugins.set('quote', quotePlugin);
        }
        
        if (config.ENABLE_CALCULATOR) {
            this.plugins.set('calc', calculatorPlugin);
            this.plugins.set('calculate', calculatorPlugin);
        }
        
        if (config.ENABLE_ADMIN_COMMANDS) {
            this.plugins.set('admin', adminPlugin);
        }
        
        logger.info(`Loaded ${this.plugins.size} plugins`);
    }
    
    async handle(messageUpdate) {
        try {
            const { messages, type } = messageUpdate;
            
            if (type !== 'notify') return;
            
            for (const message of messages) {
                await this.processMessage(message);
            }
        } catch (error) {
            logger.error('Error handling message update:', error);
        }
    }
    
    async processMessage(message) {
        try {
            // Skip if message is from status broadcast
            if (message.key.remoteJid === 'status@broadcast') return;
            
            // Skip if no message content
            if (!message.message) return;
            
            // Get message text
            const messageText = getMessageContent(message.message);
            if (!messageText) return;
            
            // Parse command
            const parsed = parseCommand(messageText);
            if (!parsed) return;
            
            const { command, args } = parsed;
            const senderId = getSenderId(message);
            
            // Rate limiting check
            if (!checkRateLimit(senderId)) {
                await this.sock.sendMessage(message.key.remoteJid, {
                    text: '⚠️ You are sending commands too quickly. Please wait a moment.'
                }, { quoted: message });
                return;
            }
            
            // Check if plugin exists
            const plugin = this.plugins.get(command);
            if (!plugin) {
                // Send a helpful message for unknown commands
                await this.sock.sendMessage(message.key.remoteJid, {
                    text: `❓ Unknown command: *${command}*\n\nType *${config.PREFIX}help* to see available commands.`
                }, { quoted: message });
                return;
            }
            
            // Create context object
            const context = {
                sock: this.sock,
                message,
                args,
                command,
                senderId,
                isGroup: message.key.remoteJid?.endsWith('@g.us'),
                messageText,
                reply: async (text, options = {}) => {
                    return await this.sock.sendMessage(message.key.remoteJid, {
                        text,
                        ...options
                    }, { quoted: message });
                },
                react: async (emoji) => {
                    return await this.sock.sendMessage(message.key.remoteJid, {
                        react: {
                            text: emoji,
                            key: message.key
                        }
                    });
                }
            };
            
            logger.info(`Command executed: ${command} by ${senderId}`);
            
            // Execute plugin
            await plugin.execute(context);
            
        } catch (error) {
            logger.error('Error processing message:', error);
            
            // Send error message to user
            try {
                await this.sock.sendMessage(message.key.remoteJid, {
                    text: '❌ An error occurred while processing your command. Please try again later.'
                }, { quoted: message });
            } catch (sendError) {
                logger.error('Error sending error message:', sendError);
            }
        }
    }
}
