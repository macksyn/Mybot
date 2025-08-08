import { 
    makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import { logger } from './utils/logger.js';
import { config } from './config/config.js';
import { MessageHandler } from './handlers/messageHandler.js';
import { sessionStringToAuth } from './utils/sessionManager.js';
import fs from 'fs-extra';
import path from 'path';

export async function createBot() {
    let authState;
    let saveCreds;
    
    try {
        // Setup authentication method
        if (config.isUsingSessionString()) {
            logger.info('🔑 Using session string authentication');
            authState = await sessionStringToAuth(config.SESSION_STRING);
            
            // Create save function for session string mode
            saveCreds = async () => {
                try {
                    // Save backup to local files if needed
                    const sessionPath = config.getSessionPath();
                    await fs.ensureDir(sessionPath);
                    
                    const credsPath = path.join(sessionPath, 'creds.json');
                    await fs.writeJSON(credsPath, authState.state.creds, { spaces: 2 });
                    
                    logger.debug('💾 Session backup saved');
                } catch (error) {
                    logger.debug('Could not save session backup:', error.message);
                }
            };
            
        } else {
            logger.info('📁 Using file-based authentication');
            
            const sessionPath = config.getSessionPath();
            await fs.ensureDir(sessionPath);
            
            // Check if session files exist
            const credsFile = path.join(sessionPath, 'creds.json');
            if (!await fs.pathExists(credsFile)) {
                throw new Error(`No session files found in ${sessionPath}. Please provide SESSION_STRING or session files.`);
            }
            
            const { state, saveCreds: fileSaveCreds } = await useMultiFileAuthState(sessionPath);
            authState = { state };
            saveCreds = fileSaveCreds;
        }
        
        // Get latest Baileys version
        const { version, isLatest } = await fetchLatestBaileysVersion();
        logger.info(`📱 Using Baileys v${version.join('.')}, latest: ${isLatest}`);
        
        // Create WhatsApp socket
        const sock = makeWASocket({
            version,
            auth: {
                creds: authState.state.creds,
                keys: makeCacheableSignalKeyStore(authState.state.keys, logger.child({ stream: 'keys' }))
            },
            printQRInTerminal: false, // We use session, no QR needed
            browser: [config.BOT_NAME, 'Chrome', '119.0.0'],
            logger: logger.child({ stream: 'baileys' }),
            generateHighQualityLinkPreview: true,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 30000,
            keepAliveIntervalMs: 25000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            fireInitQueries: false,
            emitOwnEvents: false,
            getMessage: async (key) => {
                return { conversation: 'Hello from bot!' };
            }
        });
        
        // Initialize message handler
        const messageHandler = new MessageHandler(sock);
        
        // Connection event handler
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                logger.warn('⚠️  QR code generated - this should not happen with session auth');
                logger.warn('💡 Your session might be invalid. Try generating a new one.');
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                logger.info('🔌 Connection closed:', getDisconnectReason(statusCode));
                
                if (statusCode === DisconnectReason.loggedOut) {
                    logger.error('❌ Bot has been logged out remotely');
                    logger.error('🔧 You need to generate a new session string');
                    
                    if (config.SEND_STARTUP_MESSAGE && config.OWNER_NUMBER) {
                        try {
                            await sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                                text: '🚨 *Bot Logged Out*\n\nThe bot has been logged out remotely. Please generate a new session string and restart the bot.'
                            });
                        } catch (error) {
                            logger.debug('Could not send logout notification');
                        }
                    }
                    
                    process.exit(1);
                } else if (shouldReconnect) {
                    const delay = getReconnectDelay(statusCode);
                    logger.info(`🔄 Reconnecting in ${delay}ms...`);
                    setTimeout(() => createBot(), delay);
                } else {
                    logger.error('❌ Connection lost permanently');
                    process.exit(1);
                }
            } else if (connection === 'open') {
                logger.info('✅ Connected to WhatsApp successfully!');
                logger.info(`🤖 ${config.BOT_NAME} is now online and ready!`);
                
                // Get bot info
                const botNumber = sock.user?.id?.split(':')[0] || 'Unknown';
                const botName = sock.user?.name || config.BOT_NAME;
                
                logger.info(`📱 Bot Number: ${botNumber}`);
                logger.info(`👤 Bot Name: ${botName}`);
                logger.info(`🔑 Auth Method: ${config.isUsingSessionString() ? 'Mega.nz Session' : 'File-based'}`);
                
                // Send startup notification
                if (config.SEND_STARTUP_MESSAGE && config.OWNER_NUMBER) {
                    await sendStartupNotification(sock, botNumber, botName);
                }
                
                // Set presence
                await updatePresence(sock);
            } else if (connection === 'connecting') {
                logger.info('🔄 Connecting to WhatsApp...');
            }
        });
        
        // Credentials update handler
        sock.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                logger.debug('🔄 Credentials updated');
            } catch (error) {
                logger.error('Failed to save credentials:', error);
            }
        });
        
        // Message handler
        sock.ev.on('messages.upsert', async (messageUpdate) => {
            try {
                await messageHandler.handle(messageUpdate);
            } catch (error) {
                logger.error('Error handling messages:', error);
            }
        });
        
        // Presence updates
        const presenceInterval = setInterval(async () => {
            try {
                await updatePresence(sock);
            } catch (error) {
                // Ignore presence update errors
            }
        }, 60000);
        
        // Cleanup on disconnect
        sock.ev.on('connection.update', (update) => {
            if (update.connection === 'close') {
                clearInterval(presenceInterval);
            }
        });
        
        return sock;
        
    } catch (error) {
        logger.error('❌ Failed to create bot:', error);
        throw error;
    }
}

/**
 * Send startup notification to owner
 */
async function sendStartupNotification(sock, botNumber, botName) {
    try {
        const authMethod = config.isUsingSessionString() ? 'Mega.nz Session' : 'File-based';
        const sessionInfo = config.getSessionInfo();
        
        const startupMessage = `🚀 *${config.BOT_NAME} Started Successfully!*\n\n` +
                              `📅 *Startup Time:* ${new Date().toLocaleString('en-US', { timeZone: config.TIMEZONE })}\n` +
                              `📱 *Bot Number:* ${botNumber}\n` +
                              `👤 *Bot Name:* ${botName}\n` +
                              `🆔 *Session ID:* ${config.SESSION_ID}\n` +
                              `🔑 *Auth Method:* ${authMethod}\n` +
                              `⚡ *Prefix:* ${config.PREFIX}\n` +
                              `🌍 *Environment:* ${config.NODE_ENV}\n` +
                              `🕐 *Timezone:* ${config.TIMEZONE}\n` +
                              `📊 *Node.js:* ${process.version}\n\n` +
                              `✨ *Features Enabled:*\n` +
                              `• Weather: ${config.ENABLE_WEATHER ? '✅' : '❌'}\n` +
                              `• Jokes: ${config.ENABLE_JOKES ? '✅' : '❌'}\n` +
                              `• Quotes: ${config.ENABLE_QUOTES ? '✅' : '❌'}\n` +
                              `• Calculator: ${config.ENABLE_CALCULATOR ? '✅' : '❌'}\n` +
                              `• Admin Commands: ${config.ENABLE_ADMIN_COMMANDS ? '✅' : '❌'}\n\n` +
                              `🎉 *All systems operational!*\n` +
                              `Type *${config.PREFIX}help* to see available commands.`;
        
        await sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
            text: startupMessage
        });
        
        logger.info('📨 Startup notification sent to owner');
    } catch (error) {
        logger.warn('Could not send startup notification:', error.message);
    }
}

/**
 * Update bot presence
 */
async function updatePresence(sock) {
    try {
        await sock.sendPresenceUpdate('available');
    } catch (error) {
        // Ignore presence errors
    }
}

/**
 * Get human readable disconnect reason
 */
function getDisconnectReason(statusCode) {
    const reasons = {
        [DisconnectReason.badSession]: 'Bad Session',
        [DisconnectReason.connectionClosed]: 'Connection Closed',
        [DisconnectReason.connectionLost]: 'Connection Lost',
        [DisconnectReason.connectionReplaced]: 'Connection Replaced',
        [DisconnectReason.loggedOut]: 'Logged Out',
        [DisconnectReason.restartRequired]: 'Restart Required',
        [DisconnectReason.timedOut]: 'Timed Out',
        [DisconnectReason.multideviceMismatch]: 'Multi-device Mismatch'
    };
    
    return reasons[statusCode] || `Unknown (${statusCode})`;
}

/**
 * Get reconnect delay based on disconnect reason
 */
function getReconnectDelay(statusCode) {
    const delays = {
        [DisconnectReason.connectionClosed]: 5000,
        [DisconnectReason.connectionLost]: 3000,
        [DisconnectReason.timedOut]: 10000,
        [DisconnectReason.restartRequired]: 2000,
        [DisconnectReason.badSession]: 15000
    };
    
    return delays[statusCode] || 5000;
}
