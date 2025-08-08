// =================
// FIX 1: IMPROVED MESSAGE HANDLER WITH ERROR HANDLING
// =================

// Replace your processMessage method in src/handlers/messageHandler.js with this:

async processMessage(message) {
    try {
        console.log('\n=== MESSAGE PROCESSING START ===');
        console.log('Message Key:', JSON.stringify(message.key, null, 2));
        console.log('From Me:', message.key.fromMe);
        console.log('Remote JID:', message.key.remoteJid);
        
        // Skip if message is from status broadcast
        if (message.key.remoteJid === 'status@broadcast') {
            console.log('❌ Skipping: Status broadcast');
            return;
        }

        // Skip our own messages (this might be the issue!)
        if (message.key.fromMe) {
            console.log('❌ Skipping: Own message');
            return;
        }

        // Skip if no message content
        if (!message.message) {
            console.log('❌ Skipping: No message content');
            return;
        }

        console.log('Message Object:', JSON.stringify(message.message, null, 2));

        // Get message text with better error handling
        let messageText;
        try {
            messageText = getMessageContent(message.message);
            console.log('📝 Message Text:', messageText);
        } catch (error) {
            console.error('❌ Error extracting message content:', error);
            return;
        }

        if (!messageText) {
            console.log('❌ Skipping: Could not extract message text');
            return;
        }

        // Get sender ID with better error handling
        let senderId;
        try {
            senderId = getSenderId(message);
            console.log('👤 Sender ID:', senderId);
        } catch (error) {
            console.error('❌ Error getting sender ID:', error);
            return;
        }

        // Increment message count (wrap in try-catch)
        try {
            await db.incrementMessageCount();
        } catch (error) {
            console.warn('⚠️ Could not increment message count:', error.message);
        }

        // Create base context object
        const context = {
            sock: this.sock,
            message,
            senderId,
            isGroup: message.key.remoteJid?.endsWith('@g.us'),
            messageText,
            reply: async (text, options = {}) => {
                try {
                    return await this.sock.sendMessage(message.key.remoteJid, {
                        text,
                        ...options
                    }, { quoted: message });
                } catch (error) {
                    console.error('❌ Error sending reply:', error);
                    throw error;
                }
            },
            react: async (emoji) => {
                try {
                    return await this.sock.sendMessage(message.key.remoteJid, {
                        react: {
                            text: emoji,
                            key: message.key
                        }
                    });
                } catch (error) {
                    console.error('❌ Error sending reaction:', error);
                    throw error;
                }
            }
        };

        // First, try auto-detection plugins (before command parsing)
        for (const plugin of this.autoDetectPlugins) {
            if (typeof plugin.autoDetect === 'function') {
                try {
                    const handled = await plugin.autoDetect(context);
                    if (handled) {
                        console.log(`✅ Auto-detected and handled by ${plugin.name}`);
                        return;
                    }
                } catch (error) {
                    console.error(`❌ Error in auto-detect for ${plugin.name}:`, error);
                }
            }
        }

        // Parse command with better error handling
        let parsed;
        try {
            parsed = parseCommand(messageText);
            console.log('🔍 Parsed Command:', parsed);
        } catch (error) {
            console.error('❌ Error parsing command:', error);
            return;
        }

        if (!parsed) {
            console.log('❌ Not a command (no prefix or invalid format)');
            return;
        }

        const { command, args } = parsed;
        console.log(`🎯 Command: "${command}" with args:`, args);

        // Rate limiting check (wrap in try-catch)
        try {
            if (!checkRateLimit(senderId)) {
                console.log('🚫 Rate limited');
                await this.sock.sendMessage(message.key.remoteJid, {
                    text: '⚠️ You are sending commands too quickly. Please wait a moment.'
                }, { quoted: message });
                return;
            }
        } catch (error) {
            console.warn('⚠️ Rate limit check failed:', error);
        }

        // Check if plugin exists
        const plugin = this.plugins.get(command);
        if (!plugin) {
            console.log(`❌ Plugin not found for command: "${command}"`);
            console.log('📋 Available plugins:', Array.from(this.plugins.keys()).join(', '));
            
            // Send helpful message
            try {
                await this.sock.sendMessage(message.key.remoteJid, {
                    text: `❓ Unknown command: *${command}*\n\nType *${config.PREFIX}help* to see available commands.\n\n💡 Available: ${Array.from(this.plugins.keys()).slice(0, 5).join(', ')}...`
                }, { quoted: message });
            } catch (error) {
                console.error('❌ Error sending unknown command message:', error);
            }
            return;
        }

        // Increment command count (wrap in try-catch)
        try {
            await db.incrementCommandCount();
        } catch (error) {
            console.warn('⚠️ Could not increment command count:', error.message);
        }

        // Add command-specific context
        context.args = args;
        context.command = command;

        console.log(`🚀 Executing plugin: ${plugin.name}`);

        // Execute plugin with better error handling
        try {
            await plugin.execute(context);
            console.log(`✅ Plugin executed successfully: ${plugin.name}`);
        } catch (pluginError) {
            console.error(`❌ Plugin execution error (${plugin.name}):`, pluginError);
            
            // Send error message to user
            try {
                await this.sock.sendMessage(message.key.remoteJid, {
                    text: `❌ Error executing command "${command}". Please try again later.\n\n🐛 Error: ${pluginError.message}`
                }, { quoted: message });
            } catch (sendError) {
                console.error('❌ Error sending error message:', sendError);
            }
        }

        console.log('=== MESSAGE PROCESSING END ===\n');

    } catch (error) {
        console.error('💥 CRITICAL ERROR in processMessage:', error);
        logger.error('Critical error processing message:', error);
        
        // Try to send a basic error message
        try {
            if (message?.key?.remoteJid && this.sock) {
                await this.sock.sendMessage(message.key.remoteJid, {
                    text: '💥 A critical error occurred. Please contact the bot administrator.'
                });
            }
        } catch (sendError) {
            console.error('💥 Could not send critical error message:', sendError);
        }
    }
}

// =================
// FIX 2: IMPROVED MESSAGE CONTENT EXTRACTION
// =================

// Replace your getMessageContent function in src/utils/helpers.js:

export function getMessageContent(message) {
    try {
        // Handle different message types safely
        if (!message || typeof message !== 'object') {
            return null;
        }

        // Direct conversation
        if (message.conversation && typeof message.conversation === 'string') {
            return message.conversation.trim();
        }

        // Extended text message
        if (message.extendedTextMessage?.text && typeof message.extendedTextMessage.text === 'string') {
            return message.extendedTextMessage.text.trim();
        }

        // Media with caption
        const mediaTypes = [
            'imageMessage',
            'videoMessage', 
            'documentMessage',
            'audioMessage'
        ];

        for (const mediaType of mediaTypes) {
            if (message[mediaType]?.caption && typeof message[mediaType].caption === 'string') {
                return message[mediaType].caption.trim();
            }
        }

        // List message
        if (message.listMessage?.title && typeof message.listMessage.title === 'string') {
            return message.listMessage.title.trim();
        }

        // Button message
        if (message.buttonsMessage?.contentText && typeof message.buttonsMessage.contentText === 'string') {
            return message.buttonsMessage.contentText.trim();
        }

        // Template message
        if (message.templateMessage?.hydratedTemplate?.hydratedContentText) {
            return message.templateMessage.hydratedTemplate.hydratedContentText.trim();
        }

        console.log('⚠️ Unknown message type:', Object.keys(message));
        return null;

    } catch (error) {
        console.error('❌ Error extracting message content:', error);
        return null;
    }
}

// =================
// FIX 3: IMPROVED SENDER ID EXTRACTION
// =================

// Replace your getSenderId function in src/utils/helpers.js:

export function getSenderId(message) {
    try {
        if (!message || !message.key) {
            throw new Error('Invalid message object');
        }

        // If it's from us, return 'me'
        if (message.key.fromMe) {
            return 'me';
        }

        // For group messages, use participant
        if (message.key.participant) {
            return message.key.participant;
        }

        // For direct messages, use remoteJid
        if (message.key.remoteJid) {
            return message.key.remoteJid;
        }

        throw new Error('Could not determine sender ID');

    } catch (error) {
        console.error('❌ Error getting sender ID:', error);
        throw error;
    }
}

// =================
// FIX 4: IMPROVED PARSE COMMAND FUNCTION
// =================

// Replace your parseCommand function in src/utils/helpers.js:

export function parseCommand(messageText) {
    try {
        if (!messageText || typeof messageText !== 'string') {
            return null;
        }

        const trimmed = messageText.trim();
        
        if (!trimmed.startsWith(config.PREFIX)) {
            return null;
        }

        // Remove prefix and split into parts
        const withoutPrefix = trimmed.slice(config.PREFIX.length);
        
        if (!withoutPrefix) {
            return null;
        }

        const parts = withoutPrefix.trim().split(/\s+/);
        const command = parts.shift()?.toLowerCase();
        
        if (!command) {
            return null;
        }

        return { 
            command, 
            args: parts 
        };

    } catch (error) {
        console.error('❌ Error parsing command:', error);
        return null;
    }
}

// =================
// FIX 5: SIMPLE TEST COMMAND (ADD TO messageHandler.js)
// =================

// Add this test command to your loadPlugins() method:

const simpleTestPlugin = {
    name: 'debug',
    description: 'Simple debug command',
    usage: '.debug',
    category: 'test',
    
    async execute(context) {
        const { reply, senderId, messageText, isGroup } = context;
        
        console.log('🧪 DEBUG COMMAND EXECUTED!');
        
        try {
            const debugInfo = `🧪 *Debug Information*\n\n` +
                            `📱 *Sender:* ${senderId}\n` +
                            `💬 *Message:* ${messageText}\n` +
                            `👥 *Is Group:* ${isGroup ? 'Yes' : 'No'}\n` +
                            `🕒 *Time:* ${new Date().toISOString()}\n` +
                            `🔧 *Prefix:* ${config.PREFIX}\n` +
                            `🤖 *Bot:* ${config.BOT_NAME}\n\n` +
                            `✅ *Status:* Command processing working!`;
            
            await reply(debugInfo);
            console.log('✅ Debug command completed successfully');
            
        } catch (error) {
            console.error('❌ Error in debug command:', error);
            await reply('❌ Error in debug command: ' + error.message);
        }
    }
};

// Add to your plugins (in loadPlugins method):
this.plugins.set('debug', simpleTestPlugin);

// =================
// FIX 6: CORRECTED .ENV FILE
// =================

# Bot Configuration
BOT_NAME=Groq 🤖
PREFIX=.
TIMEZONE=Africa/Lagos

# Fix phone number format (use consistent 13-digit format)
OWNER_NUMBER=2348111637463
ADMIN_NUMBERS=2348111637463,2348089782988

# Session settings
SESSION_STRING=your-actual-session-string
SESSION_ID=Groq

SEND_STARTUP_MESSAGE=true
AUTO_RESTART_ON_LOGOUT=false

# Enable debugging
NODE_ENV=development
LOG_LEVEL=debug
LOG_TO_FILE=true

# Enable all features
ENABLE_WEATHER=true
ENABLE_JOKES=true
ENABLE_QUOTES=true
ENABLE_CALCULATOR=true
ENABLE_ADMIN_COMMANDS=true
ENABLE_GROUP_EVENTS=true
ENABLE_ECONOMY=true
ENABLE_ATTENDANCE=true

# Database
MONGODB_URI=mongodb+srv://macksyn:mygroqdatabase1234@groq.lm0dims.mongodb.net/?retryWrites=true&w=majority&appName=Groq

PORT=8000

// =================
// TESTING SEQUENCE
// =================

// 1. Apply all the fixes above
// 2. Update your .env file with correct phone numbers
// 3. Restart your bot
// 4. Test with these commands (in this order):
//    - ".debug"     (new simple test command)
//    - ".ping"      (basic functionality)
//    - ".help"      (list commands)
//    - ".testperms" (check permissions)

// 5. Watch the console output - it will show you exactly what's happening

// =================
// KEY ISSUES ADDRESSED:
// =================

// 1. Added comprehensive error handling to prevent TypeErrors
// 2. Fixed message content extraction with better type checking
// 3. Improved sender ID extraction with fallbacks
// 4. Added detailed logging to track message processing flow
// 5. Fixed phone number format in config
// 6. Added a simple debug command that should always work
// 7. Wrapped all async operations in try-catch blocks

// The "[TypeError]" errors should be resolved with these improvements!
