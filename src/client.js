import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, delay, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { logger } from './utils/logger.js';
import { config } from './config/config.js';
import { MessageHandler } from './handlers/messageHandler.js';
import { EventHandler } from './handlers/eventHandler.js';
import { sessionManager } from './utils/sessionManager.js';

let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

export async function createBot() {
    if (isConnecting) {
        logger.info('Already connecting, skipping...');
        return;
    }
    
    isConnecting = true;
    
    try {
        // FIXED: Load session from MongoDB ONLY if no local session exists
        logger.info('🔍 Checking for existing session...');
        
        let sessionLoadedFromMongo = false;
        try {
            // Check if local session files exist first
            const fs = await import('fs/promises');
            await fs.access('./sessions');
            logger.info('📁 Local session files found, using local session');
        } catch {
            // No local session, try loading from MongoDB
            logger.info('📭 No local session found, attempting MongoDB restore...');
            sessionLoadedFromMongo = await sessionManager.loadSession();
            if (sessionLoadedFromMongo) {
                logger.info('✅ Session restored from MongoDB');
                // Add delay to let files settle
                await delay(2000);
            } else {
                logger.info('📭 No session found in MongoDB either, will create new session');
            }
        }
        
        const { state, saveCreds } = await useMultiFileAuthState('./sessions');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        
        logger.info(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);
        
        // Browser selection similar to the working implementation
        const browsers = ["Chrome", "Firefox", "Safari", "Edge"];
        const randomBrowser = browsers[Math.floor(Math.random() * browsers.length)];
        
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger.child({ module: 'keys' }))
            },
            printQRInTerminal: false,
            logger: logger.child({ module: 'baileys' }),
            browser: Browsers.macOS(randomBrowser),
            generateHighQualityLinkPreview: true,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            emitOwnEvents: false,
            retryRequestDelayMs: 250,
            maxMsgRetryCount: 5,
            // FIXED: Better message retrieval to avoid conflicts
            getMessage: async (key) => {
                return undefined; // Return undefined instead of dummy message
            }
        });
        
        // Initialize handlers
        const messageHandler = new MessageHandler(sock);
        const eventHandler = new EventHandler(sock);
        
        // Handle pairing code generation - Use PAIRING_NUMBER instead of OWNER_NUMBER
        if (config.USE_PAIRING_CODE && config.PAIRING_NUMBER && !sock.authState.creds.registered) {
            logger.info('🔗 Bot not registered, preparing pairing code...');
            
            // Add delay before requesting pairing code
            await delay(2000);
            
            try {
                const phoneNumber = config.PAIRING_NUMBER.replace(/\D/g, '');
                logger.info(`📱 Requesting pairing code for: ${phoneNumber}`);
                logger.info(`📋 Note: This is for LOGIN only. Bot admin/owner is: ${config.OWNER_NUMBER}`);
                
                const code = await sock.requestPairingCode(phoneNumber);
                logger.info(`📱 Your pairing code: ${code}`);
                logger.info(`📞 Enter this code in WhatsApp > Linked Devices > Link a Device > Link with phone number instead`);
                logger.info(`⏰ This code will expire in about 20 seconds. Enter it quickly!`);
                
                // Send notification if webhook is configured
                if (config.WEBHOOK_URL) {
                    await sendPairingCodeNotification(code, phoneNumber);
                }
            } catch (error) {
                logger.error('Failed to generate pairing code:', error.message);
                logger.info('Connection might not be ready yet, will try again...');
            }
        }
        
        // FIXED: Enhanced credentials update with delayed session persistence
        let credentialsSaveTimeout = null;
        sock.ev.on('creds.update', async () => {
            await saveCreds();
            
            // FIXED: Debounced auto-save to MongoDB to prevent conflicts
            if (config.PERSIST_SESSIONS && credentialsSaveTimeout === null) {
                credentialsSaveTimeout = setTimeout(async () => {
                    try {
                        // Only save if connection is stable
                        if (sock.ws?.readyState === 1) {
                            await sessionManager.saveSession();
                            logger.debug('📁 Session auto-saved to MongoDB');
                        }
                    } catch (error) {
                        logger.debug('Session auto-save failed:', error.message);
                    } finally {
                        credentialsSaveTimeout = null;
                    }
                }, 5000); // 5-second delay
            }
        });
        
        // Connection events
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            logger.info(`Connection update: ${connection}`);
            
            if (qr && !config.USE_PAIRING_CODE) {
                logger.info('📱 QR Code received, scan with WhatsApp:');
                qrcode.generate(qr, { small: true });
                
                if (config.NODE_ENV === 'production') {
                    logger.warn('⚠️  Running in production without pairing code setup!');
                    logger.info('💡 Set USE_PAIRING_CODE=true and PAIRING_NUMBER in environment variables for easier deployment');
                }
            }
            
            if (connection === 'close') {
                isConnecting = false;
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                logger.info(`Connection closed. Status code: ${statusCode}`);
                logger.info('Disconnect reason:', lastDisconnect?.error?.message || 'Unknown');
                
                // FIXED: Handle 401 errors specifically
                if (statusCode === 401) {
                    logger.error('❌ Authentication failed (401). Session may be corrupted.');
                    
                    // Clear both local and MongoDB sessions for fresh start
                    logger.info('🗑️ Clearing corrupted session...');
                    await sessionManager.deleteSession();
                    
                    if (reconnectAttempts < 2) { // Only retry twice for 401 errors
                        reconnectAttempts++;
                        logger.info(`🔄 Retrying with fresh session in 10 seconds... (Attempt ${reconnectAttempts}/2)`);
                        setTimeout(() => createBot(), 10000);
                    } else {
                        logger.error('❌ Max authentication attempts reached. Manual restart required.');
                        process.exit(1);
                    }
                    return;
                }
                
                if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    const delayTime = Math.min(reconnectAttempts * 2000, 10000); // Exponential backoff, max 10s
                    
                    logger.info(`🔄 Reconnecting in ${delayTime/1000} seconds... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                    setTimeout(() => createBot(), delayTime);
                } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    logger.error('❌ Max reconnection attempts reached. Manual restart required.');
                    process.exit(1);
                } else {
                    logger.info('❌ Logged out. Please restart the bot to authenticate again.');
                    
                    // Clear session when logged out
                    if (statusCode === DisconnectReason.loggedOut) {
                        logger.info('🗑️ Clearing session due to logout...');
                        await sessionManager.deleteSession();
                    }
                    
                    if (config.AUTO_RESTART_ON_LOGOUT) {
                        logger.info('🔄 Auto-restart enabled, restarting in 10 seconds...');
                        setTimeout(() => {
                            process.exit(0); // Let the process manager restart
                        }, 10000);
                    } else {
                        process.exit(0);
                    }
                }
            } else if (connection === 'open') {
                isConnecting = false;
                reconnectAttempts = 0; // Reset on successful connection
                
                logger.info('✅ Connected to WhatsApp successfully!');
                logger.info(`🤖 ${config.BOT_NAME} is now online and ready!`);
                logger.info(`👤 Connected as: ${sock.user?.name || 'Unknown'} (${sock.user?.id || 'Unknown'})`);
                logger.info(`📱 Pairing Number: ${config.PAIRING_NUMBER}`);
                logger.info(`👑 Owner Number: ${config.OWNER_NUMBER}`);
                logger.info(`👥 Admin Numbers: ${config.ADMIN_NUMBERS.join(', ')}`);
                
                // FIXED: Save successful session to MongoDB with delay
                if (config.PERSIST_SESSIONS) {
                    // Wait a bit for connection to fully stabilize
                    setTimeout(async () => {
                        try {
                            await sessionManager.saveSession();
                            logger.info('💾 Session saved to MongoDB for persistence');
                            
                            // Start auto-save only after initial save
                            sessionManager.startAutoSave();
                        } catch (error) {
                            logger.warn('Could not save session to MongoDB:', error.message);
                        }
                    }, 10000); // 10-second delay
                }
                
                // Send startup message to owner (not pairing number)
                if (config.OWNER_NUMBER && config.SEND_STARTUP_MESSAGE) {
                    // Wait for connection to fully stabilize before sending messages
                    setTimeout(async () => {
                        try {
                            const ownerJid = config.OWNER_NUMBER.replace(/\D/g, '') + '@s.whatsapp.net';
                            await sock.sendMessage(ownerJid, {
                                text: `🤖 *${config.BOT_NAME}* is now online!\n\n` +
                                      `📅 Started: ${new Date().toLocaleString()}\n` +
                                      `🔧 Prefix: ${config.PREFIX}\n` +
                                      `🌐 Environment: ${config.NODE_ENV}\n` +
                                      `⚡ Node.js: ${process.version}\n` +
                                      `👤 Connected as: ${sock.user?.name || 'Bot'}\n` +
                                      `💾 Session Persistence: ${config.PERSIST_SESSIONS ? '✅ Enabled' : '❌ Disabled'}\n` +
                                      `📱 Logged in via: ${config.PAIRING_NUMBER}\n\n` +
                                      `✅ All systems operational!\n` +
                                      `Type ${config.PREFIX}help to see available commands.`
                            });
                            logger.info('📨 Startup notification sent to owner');
                        } catch (error) {
                            logger.warn('Could not send startup message to owner:', error.message);
                        }
                    }, 15000); // 15-second delay
                }
            } else if (connection === 'connecting') {
                logger.info('🔄 Connecting to WhatsApp...');
            }
        });
        
        // Message events
        sock.ev.on('messages.upsert', async (messageUpdate) => {
            try {
                await messageHandler.handle(messageUpdate);
            } catch (error) {
                logger.error('Error handling message:', error);
            }
        });
        
        // Other events
        sock.ev.on('group-participants.update', async (update) => {
            try {
                await eventHandler.handleGroupUpdate(update);
            } catch (error) {
                logger.error('Error handling group update:', error);
            }
        });
        
        sock.ev.on('messages.reaction', async (reaction) => {
            try {
                await eventHandler.handleReaction(reaction);
            } catch (error) {
                logger.error('Error handling reaction:', error);
            }
        });
        
        // FIXED: Improved presence update with better connection checking
        const presenceInterval = setInterval(async () => {
            try {
                if (sock.ws?.readyState === 1 && connection === 'open') {
                    await sock.sendPresenceUpdate('available');
                }
            } catch (error) {
                // Ignore presence update errors, but log for debugging
                logger.debug('Presence update failed:', error.message);
            }
        }, 60000);
        
        // Clean up interval on disconnect
        sock.ev.on('connection.update', (update) => {
            if (update.connection === 'close') {
                clearInterval(presenceInterval);
                if (credentialsSaveTimeout) {
                    clearTimeout(credentialsSaveTimeout);
                    credentialsSaveTimeout = null;
                }
            }
        });
        
        return sock;
        
    } catch (error) {
        isConnecting = false;
        logger.error('Error creating bot:', error);
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            const delayTime = Math.min(reconnectAttempts * 3000, 15000);
            logger.info(`🔄 Retrying bot creation in ${delayTime/1000} seconds... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
            setTimeout(() => createBot(), delayTime);
        } else {
            logger.error('❌ Max creation attempts reached. Exiting...');
            process.exit(1);
        }
    }
}

// Helper function to send pairing code notification
async function sendPairingCodeNotification(code, phoneNumber) {
    try {
        if (config.WEBHOOK_URL) {
            const response = await fetch(config.WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'pairing_code',
                    code: code,
                    phone_number: phoneNumber,
                    timestamp: new Date().toISOString(),
                    bot_name: config.BOT_NAME
                })
            });
            
            if (response.ok) {
                logger.info('📤 Pairing code notification sent to webhook');
            }
        }
    } catch (error) {
        logger.warn('Failed to send pairing code notification:', error.message);
    }
}
