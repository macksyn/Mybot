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
import pairPlugin from '../plugins/pair.js';

// Import new plugins
import economyPlugin from '../plugins/economy.js';
import attendancePlugin from '../plugins/attendance.js';
import birthdayPlugin from '../plugins/birthday.js';

export class MessageHandler {
    constructor(sock) {
        this.sock = sock;
        this.plugins = new Map();
        this.autoDetectPlugins = [];
        this.loadPlugins();
        this.initializePlugins();
    }
    
    loadPlugins() {
        // Core plugins (always loaded)
        this.plugins.set('ping', pingPlugin);
        this.plugins.set('help', helpPlugin);
        this.plugins.set('info', infoPlugin);
        
        // Economy system plugins
        this.plugins.set('economy', economyPlugin);
        this.plugins.set('eco', economyPlugin);
        this.plugins.set('money', economyPlugin);
        this.plugins.set('wallet', economyPlugin);
        this.plugins.set('balance', economyPlugin);
        this.plugins.set('bal', economyPlugin);
        this.plugins.set('send', economyPlugin);
        this.plugins.set('transfer', economyPlugin);
        this.plugins.set('pay', economyPlugin);
        this.plugins.set('deposit', economyPlugin);
        this.plugins.set('dep', economyPlugin);
        this.plugins.set('withdraw', economyPlugin);
        this.plugins.set('wd', economyPlugin);
        this.plugins.set('work', economyPlugin);
        this.plugins.set('rob', economyPlugin);
        this.plugins.set('daily', economyPlugin);
        this.plugins.set('profile', economyPlugin);
        this.plugins.set('leaderboard', economyPlugin);
        this.plugins.set('lb', economyPlugin);
        this.plugins.set('clan', economyPlugin);
        this.plugins.set('shop', economyPlugin);
        this.plugins.set('inventory', economyPlugin);
        this.plugins.set('inv', economyPlugin);
        
        // Attendance system plugins
        this.plugins.set('attendance', attendancePlugin);
        this.plugins.set('attend', attendancePlugin);
        this.plugins.set('att', attendancePlugin);
        
        // Birthday system plugins
        this.plugins.set('birthday', birthdayPlugin);
        this.plugins.set('bday', birthdayPlugin);
        this.plugins.set('birthdays', birthdayPlugin);
        
        // Auto-detect plugins (plugins that can automatically detect and handle messages)
        this.autoDetectPlugins = [attendancePlugin];
        
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
            this.plugins.set('pair', pairPlugin);
        }
        
        logger.info(`Loaded ${this.plugins.size} plugins with ${this.autoDetectPlugins.length} auto-detect plugins`);
    }
    
    async initializePlugins() {
        // Initialize plugins that have an initialize method
        for (const [name, plugin] of this.plugins) {
            if (typeof plugin.initialize === 'function') {
                try {
                    await plugin.initialize(this.sock);
                    logger.info(`✅ Initialized plugin: ${name}`);
                } catch (error) {
                    logger.error(`❌ Failed to initialize plugin ${name}:`, error);
                }
            }
        }
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
            
            const senderId = getSenderId(message);
            
            // Create base context object
            const context = {
                sock: this.sock,
                message,
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
            
            // First, try auto-detection plugins (before command parsing)
            for (const plugin of this.autoDetectPlugins) {
                if (typeof plugin.autoDetect === 'function') {
                    try {
                        const handled = await plugin.autoDetect(context);
                        if (handled) {
                            logger.info(`Auto-detected and handled by ${plugin.name}: ${senderId}`);
                            return; // Message was handled, stop processing
                        }
                    } catch (error) {
                        logger.error(`Error in auto-detect for ${plugin.name}:`, error);
                    }
                }
            }
            
            // Parse command
            const parsed = parseCommand(messageText);
            if (!parsed) return;
            
            const { command, args } = parsed;
            
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
            
            // Add command-specific context
            context.args = args;
            context.command = command;
            
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
