import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';
import { parseCommand, checkRateLimit, getMessageContent, getSenderId } from '../utils/helpers.js';

// Import plugins
import pingPlugin from '../plugins/ping.js';
import helpPlugin from '../plugins/help.js';
import infoPlugin from '../plugins/info.js';
import sessionTestPlugin from '../plugins/sessiontest.js';

// Conditional plugin imports
let weatherPlugin, jokePlugin, quotePlugin, calculatorPlugin, adminPlugin;

// Load plugins based on configuration
if (config.ENABLE_WEATHER) {
    try {
        const module = await import('../plugins/weather.js');
        weatherPlugin = module.default;
    } catch (error) {
        logger.warn('Weather plugin not available:', error.message);
    }
}

if (config.ENABLE_JOKES) {
    try {
        const module = await import('../plugins/joke.js');
        jokePlugin = module.default;
    } catch (error) {
        logger.warn('Joke plugin not available:', error.message);
    }
}

if (config.ENABLE_QUOTES) {
    try {
        const module = await import('../plugins/quote.js');
        quotePlugin = module.default;
    } catch (error) {
        logger.warn('Quote plugin not available:', error.message);
    }
}

if (config.ENABLE_CALCULATOR) {
    try {
        const module = await import('../plugins/calculator.js');
        calculatorPlugin = module.default;
    } catch (error) {
        logger.warn('Calculator plugin not available:', error.message);
    }
}

if (config.ENABLE_ADMIN_COMMANDS) {
    try {
        const module = await import('../plugins/admin.js');
        adminPlugin = module.default;
    } catch (error) {
        logger.warn('Admin plugin not available:', error.message);
    }
}

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
        this.plugins.set('sessiontest', sessionTestPlugin);
        this.plugins.set('test', sessionTestPlugin);
        
        // Conditional plugins
        if (weatherPlugin) {
            this.plugins.set('weather', weatherPlugin);
            this.plugins.set('w', weatherPlugin);
        }
        
        if (jokePlugin) {
            this.plugins.set('joke', jokePlugin);
            this.plugins.set('j', jokePlugin);
        }
        
        if (quotePlugin) {
            this.plugins.set('quote', quotePlugin);
            this.plugins.set('q', quotePlugin);
        }
        
        if (calculatorPlugin) {
            this.plugins.set('calc', calculatorPlugin);
            this.plugins.set('calculate', calculatorPlugin);
            this.plugins.set('math', calculatorPlugin);
        }
        
        if (adminPlugin) {
            this.plugins.set('admin', adminPlugin);
            this.plugins.set('sudo', adminPlugin);
        }
        
        logger.info(`📦 Loaded ${this.plugins.size} plugins`);
        logger.debug('Available commands:', Array.from(this.plugins.keys()));
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
            // Skip status broadcasts
            if (message.key.remoteJid === 'status@broadcast') return;
            
            // Skip if no message content
            if (!message.message) return;
            
            // Get message text
            const messageText = getMessageContent(message.message);
            if (!messageText) return;
            
            // Parse command
            const parsed = parseCommand(messageText);
            if (!parsed) {
                // Auto-react to non-commands if enabled
                if (config.ENABLE_AUTO_REACT && Math.random() < 0.1) {
                    await this.autoReact(message);
                }
                return;
            }
            
            const { command, args } = parsed;
            const senderId = getSenderId(message);
            const isGroup = message.key.remoteJid?.endsWith('@g.us');
            
            logger.info(`📨 Command: ${command} | User: ${senderId} | Group: ${isGroup}`);
            
            // Rate limiting check
            if (!checkRateLimit(senderId)) {
                await this.sock.sendMessage(message.key.remoteJid, {
                    text: '⚠️ *Rate Limited*\n\nYou are sending commands too quickly. Please wait a moment before trying again.'
                }, { quoted: message });
                return;
            }
            
            // Check if plugin exists
            const plugin = this.plugins.get(command.toLowerCase());
            if (!plugin) {
                await this.handleUnknownCommand(message, command);
                return;
            }
            
            // Check admin permissions
            if (plugin.adminOnly && !this.checkAdminPermission(senderId)) {
                await this.sock.sendMessage(message.key.remoteJid, {
                    text: '🔒 *Access Denied*\n\nThis command requires administrator privileges.'
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
                isGroup,
                messageText,
                isAdmin: this.checkAdminPermission(senderId),
                isOwner: config.isOwner(senderId),
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
                },
                send: async (content, options = {}) => {
                    return await this.sock.sendMessage(message.key.remoteJid, content, options);
                }
            };
            
            // Execute plugin
            try {
                await plugin.execute(context);
                logger.success(`Command executed: ${command} by ${senderId}`);
            } catch (pluginError) {
                logger.error(`Plugin error (${command}):`, pluginError);
                await context.reply('❌ *Command Error*\n\nSomething went wrong while executing this command. Please try again later.');
            }
            
        } catch (error) {
            logger.error('Error processing message:', error);
            
            // Send generic error message
            try {
                await this.sock.sendMessage(message.key.remoteJid, {
                    text: '❌ *Processing Error*\n\nAn error occurred while processing your message. Please try again later.'
                }, { quoted: message });
            } catch (sendError) {
                logger.error('Error sending error message:', sendError);
            }
        }
    }
    
    async handleUnknownCommand(message, command) {
        try {
            // Get similar commands
            const availableCommands = Array.from(this.plugins.keys());
            const suggestions = this.findSimilarCommands(command, availableCommands);
            
            let response = `❓ *Unknown Command: ${command}*\n\n`;
            
            if (suggestions.length > 0) {
                response += `💡 *Did you mean:*\n`;
                suggestions.forEach(cmd => {
                    response += `• ${config.PREFIX}${cmd}\n`;
                });
                response += '\n';
            }
            
            response += `📖 Type *${config.PREFIX}help* to see all available commands.`;
            
            await this.sock.sendMessage(message.key.remoteJid, {
                text: response
            }, { quoted: message });
            
        } catch (error) {
            logger.error('Error handling unknown command:', error);
        }
    }
    
    findSimilarCommands(command, availableCommands) {
        const suggestions = [];
        
        for (const availableCmd of availableCommands) {
            // Check if command starts with the same letter
            if (availableCmd[0].toLowerCase() === command[0].toLowerCase()) {
                suggestions.push(availableCmd);
            }
            // Check if command contains part of the input
            else if (availableCmd.includes(command.toLowerCase()) || command.toLowerCase().includes(availableCmd)) {
                suggestions.push(availableCmd);
            }
        }
        
        return suggestions.slice(0, 3); // Return max 3 suggestions
    }
    
    checkAdminPermission(senderId) {
        return config.isAdmin(senderId) || config.isOwner(senderId);
    }
    
    async autoReact(message) {
        try {
            const reactions = ['👍', '❤️', '😊', '👏', '🔥', '💯', '😍', '🎉'];
            const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
            
            await this.sock.sendMessage(message.key.remoteJid, {
                react: {
                    text: randomReaction,
                    key: message.key
                }
            });
        } catch (error) {
            // Ignore auto-react errors
        }
    }
}
