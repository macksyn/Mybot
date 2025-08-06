import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, delay, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { logger } from './utils/logger.js';
import { config } from './config/config.js';
import { MessageHandler } from './handlers/messageHandler.js';
import { EventHandler } from './handlers/eventHandler.js';
import { sessionManager } from './utils/sessionManager.js';

let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3; // Reduced from 5
let globalSocket = null;

export async function createBot() {
    if (isConnecting) {
        logger.info('Already connecting, skipping...');
        return;
    }
    
    isConnecting = true;
    
    try {
        // FIXED: More conservative session loading
        logger.info('🔍 Checking for existing session...');
        
        let sessionLoadedFromMongo = false;
        try {
            // Check if local session files exist first
            const fs = await import('fs/promises');
            await fs.access('./sessions');
            logger.info('📁 Local session files found, using local session');
            
            // FIXED: Validate local session before using it
            const files = await fs.readdir('./sessions');
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            
            if (jsonFiles.length === 0) {
                logger.warn('⚠️ Local session directory exists but no JSON files found');
                await fs.rm('./sessions', { recursive: true, force: true });
                throw new Error('Invalid local session');
            }
        } catch {
            // No local session, try loading from MongoDB
            logger.info('📭 No local session found, attempting MongoDB restore...');
            sessionLoadedFromMongo = await sessionManager.loadSession();
            if (sessionLoadedFromMongo) {
                logger.info('✅ Session restored from MongoDB');
                // Add delay to let files settle
                await delay(3000); // Increased delay
            } else {
                logger.info('📭 No session found in MongoDB either, will create new session');
            }
        }
        
        const { state, saveCreds } = await useMultiFileAuthState('./sessions');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        
        logger.info(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);
        
        // FIXED: More stable browser configuration
        const browsers = ["Ubuntu", "Chrome", "Firefox"];
        const randomBrowser = browsers[Math.floor(Math.random() * browsers.length)];
        
        // FIXED: More conservative socket configuration
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger.child({ module: 'keys' }))
            },
            printQRInTerminal: false,
            logger: logger.child({ module: 'baileys' }),
            browser: Browsers.ubuntu(randomBrowser), // FIXED: Use ubuntu instead of macOS
            generateHighQualityLinkPreview: true,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000, 
            markOnlineOnConnect: false, // FIXED: Don't mark online immediately
            syncFullHistory: false, // Keep this false to avoid issues
            emitOwnEvents: false,
            retryRequestDelayMs: 500, // Increased from 250
            maxMsgRetryCount: 3, // Reduced from 5
            // FIXED: Better message retrieval
            getMessage: async (key) => {
                // Return undefined to avoid conflicts
                return undefined;
            },
            // FIXED: Additional stability options
            connectTimeoutMs: 60000,
            qrTimeout: 40000,
            shouldSyncHistoryMessage: () => false, // Disable history sync
        });
        
        globalSocket = sock;
        
        // Initialize handlers
        const messageHandler = new MessageHandler(sock);
        const eventHandler = new EventHandler(sock);
        
        // FIXED: Better pairing code handling
        if (config.USE_PAIRING_CODE && config.PAIRING_NUMBER && !sock.authState.creds.registered) {
            logger.info('🔗 Bot not registered, preparing pairing code...');
            
            // FIXED: Longer delay before requesting pairing code
            await delay(5000);
            
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
        
        // FIXED: Much more conservative credentials handling
        let credentialsSaveTimeout = null;
        let lastCredsSave = 0;
        const MIN_SAVE_INTERVAL = 10000; // 10 seconds minimum between saves
        
        sock.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                
                // FIXED: Much more conservative MongoDB saving
                const now = Date.now();
                if (config.PERSIST_SESSIONS && (now - lastCredsSave) > MIN_SAVE_INTERVAL) {
                    if (credentialsSaveTimeout) {
                        clearTimeout(credentialsSaveTimeout);
                    }
                    
                    credentialsSaveTimeout = setTimeout(async () => {
                        try {
                            // Only save if connection is fully stable
                            if (sock.ws?.readyState === 1 && sock.user) {
                                await sessionManager.saveSession();
                                lastCredsSave = Date.now();
                                logger.debug('📁 Session auto-saved to MongoDB');
                            }
                        } catch (error) {
                            logger.debug('Session auto-save failed:', error.message);
                        } finally {
                            credentialsSaveTimeout = null;
                        }
                    }, 15000); // Increased delay to 15 seconds
                }
            } catch (error) {
                logger.warn('Error saving credentials:', error.message);
            }
        });
        
        // FIXED: Enhanced connection handling
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            logger.info(`Connection update: ${connection || 'undefined'}`);
            
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
                
                // FIXED: More specific 401 handling
                if (statusCode === 401) {
                    logger.error('❌ Authentication failed (401). Session rejected by WhatsApp.');
                    
                    // FIXED: Don't immediately delete session on first 401
                    if (reconnectAttempts === 0) {
                        logger.info('🔄 First 401 error - will try once more with current session');
                        reconnectAttempts++;
                        setTimeout(() => createBot(), 15000); // Longer delay
                        return;
                    } else {
                        // Clear session only after multiple failures
                        logger.info('🗑️ Multiple auth failures, clearing session...');
                        await sessionManager.deleteSession();
                        
                        if (reconnectAttempts < 2) { 
                            reconnectAttempts++;
                            logger.info(`🔄 Retrying with fresh session in 30 seconds... (Attempt ${reconnectAttempts}/2)`);
                            setTimeout(() => createBot(), 30000); // Much longer delay
                        } else {
                            logger.error('❌ Max authentication attempts reached. Please check your setup.');
                            logger.error('💡 Try using a different PAIRING_NUMBER or wait 10-15 minutes before retrying.');
                            process.exit(1);
                        }
                    }
                    return;
                }
                
                // FIXED: Handle 515 (restart required) errors
                if (statusCode === 515) {
                    logger.warn('⚠️ WhatsApp restart required (515). Waiting before retry...');
                    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        reconnectAttempts++;
                        const delayTime = 30000; // 30 seconds for restart required
                        logger.info(`🔄 Retrying after WhatsApp restart in ${delayTime/1000} seconds...`);
                        setTimeout(() => createBot(), delayTime);
                    } else {
                        logger.error('❌ Max restart attempts reached. Manual intervention required.');
                        process.exit(1);
                    }
                    return;
                }
                
                if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    const delayTime = Math.min(reconnectAttempts * 5000, 20000); // Max 20s delay
                    
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
                
                // FIXED: Much more delayed session saving and presence updates
                if (config.PERSIST_SESSIONS) {
                    // Wait much longer for connection to fully stabilize
                    setTimeout(async () => {
                        try {
                            // Extra validation before saving
                            if (sock.ws?.readyState === 1 && sock.user?.id) {
                                await sessionManager.saveSession();
                                logger.info('💾 Session saved to MongoDB for persistence');
                                
                                // Start auto-save only after successful manual save
                                sessionManager.startAutoSave(600000); // 10 minutes instead of 5
                            } else {
                                logger.warn('⚠️ Connection not stable enough to save session yet');
                            }
                        } catch (error) {
                            logger.warn('Could not save session to MongoDB:', error.message);
                        }
                    }, 20000); // 20-second delay instead of 10
                }
                
                // FIXED: Send startup message with much longer delay
                if (config.OWNER_NUMBER && config.SEND_STARTUP_MESSAGE) {
                    setTimeout(async () => {
                        try {
                            // Extra validation before sending messages
                            if (sock.ws?.readyState !== 1) {
                                logger.warn('Connection not ready for startup message');
                                return;
                            }
                            
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
                    }, 30000); // 30-second delay instead of 15
                }
                
                // FIXED: Set presence online after everything is stable
                setTimeout(async () => {
                    try {
                        if (sock.ws?.readyState === 1) {
                            await sock.sendPresenceUpdate('available');
                            logger.debug('✅ Presence set to available');
                        }
                    } catch (error) {
                        logger.debug('Could not set initial presence:', error.message);
                    }
                }, 25000); // 25-second delay
                
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
        
        // FIXED: More conservative presence updates
        const presenceInterval = setInterval(async () => {
            try {
                if (sock.ws?.readyState === 1 && sock.user?.id) {
                    await sock.sendPresenceUpdate('available');
                }
            } catch (error) {
                // Ignore presence update errors silently
                logger.debug('Presence update failed:', error.message);
            }
        }, 120000); // 2 minutes instead of 1 minute
        
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
            const delayTime = Math.min(reconnectAttempts * 5000, 20000);
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

// Graceful shutdown function
export async function shutdown() {
    logger.info('🔄 Shutting down bot gracefully...');
    
    if (globalSocket) {
        try {
            // Save session before closing
            if (config.PERSIST_SESSIONS) {
                await sessionManager.saveSession();
            }
            
            // Close the socket
            globalSocket.ws?.close();
            globalSocket = null;
            
            logger.info('✅ Bot shutdown completed');
        } catch (error) {
            logger.error('Error during bot shutdown:', error);
        }
    }
}

// Handle process signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
