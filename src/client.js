import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, delay, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { logger } from './utils/logger.js';
import { config } from './config/config.js';
import { MessageHandler } from './handlers/messageHandler.js';
import { EventHandler } from './handlers/eventHandler.js';
import { sessionManager } from './utils/sessionManager.js';

let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

export async function createBot() {
    if (isConnecting) {
        logger.info('Already connecting, skipping...');
        return;
    }
    
    isConnecting = true;
    
    try {
        logger.info('🔍 Starting WhatsApp connection...');
        
        // SIMPLIFIED: Only restore from MongoDB on first start (not reconnections)
        if (config.PERSIST_SESSIONS && reconnectAttempts === 0) {
            logger.info('📥 Checking for saved session...');
            try {
                const restored = await sessionManager.loadSession();
                if (restored) {
                    logger.info('✅ Session restored from MongoDB');
                } else {
                    logger.info('📭 No saved session found');
                }
            } catch (error) {
                logger.warn('Session restore failed:', error.message);
            }
        }
        
        // Use local sessions (this is the primary session storage)
        const { state, saveCreds } = await useMultiFileAuthState('./sessions');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        
        logger.info(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);
        
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger.child({ module: 'keys' }))
            },
            printQRInTerminal: false,
            logger: logger.child({ module: 'baileys' }),
            browser: Browsers.ubuntu('Chrome'),
            generateHighQualityLinkPreview: true,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            emitOwnEvents: false,
            getMessage: async (key) => undefined,
        });
        
        // Initialize handlers
        const messageHandler = new MessageHandler(sock);
        const eventHandler = new EventHandler(sock);
        
        // Handle pairing ONLY for completely fresh sessions
        if (config.USE_PAIRING_CODE && config.PAIRING_NUMBER && !state.creds.registered) {
            logger.info('🔗 Fresh session - requesting pairing code...');
            await delay(3000);
            
            try {
                const phoneNumber = config.PAIRING_NUMBER.replace(/\D/g, '');
                const code = await sock.requestPairingCode(phoneNumber);
                logger.info(`📱 Pairing Code: ${code}`);
                logger.info(`📞 Go to WhatsApp > Settings > Linked Devices > Link a Device > Link with phone number`);
                logger.info(`⏰ Enter code quickly - it expires in ~20 seconds!`);
            } catch (error) {
                logger.error('Pairing code error:', error.message);
            }
        }
        
        // Save credentials when they change
        sock.ev.on('creds.update', async () => {
            await saveCreds();
        });
        
        // Connection handling
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // Show QR code only if pairing code is disabled
            if (qr && !config.USE_PAIRING_CODE) {
                logger.info('📱 QR Code:');
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'close') {
                isConnecting = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                logger.info(`Connection closed. Status: ${statusCode}`);
                
                if (statusCode === 401) {
                    // Authentication failed - clear everything
                    logger.error('❌ Authentication failed - clearing sessions');
                    
                    try {
                        // Clear local session
                        const fs = await import('fs');
                        if (fs.existsSync('./sessions')) {
                            fs.rmSync('./sessions', { recursive: true, force: true });
                        }
                        
                        // Clear MongoDB session
                        if (config.PERSIST_SESSIONS) {
                            await sessionManager.deleteSession();
                        }
                    } catch (error) {
                        logger.warn('Session cleanup error:', error.message);
                    }
                    
                    // Only retry once for auth failures
                    if (reconnectAttempts < 1) {
                        reconnectAttempts++;
                        logger.info('🔄 Retrying with fresh session in 30 seconds...');
                        setTimeout(() => createBot(), 30000);
                    } else {
                        logger.error('❌ Max auth retries reached. Please restart manually.');
                        process.exit(1);
                    }
                    return;
                }
                
                // Handle other disconnections
                if (statusCode !== DisconnectReason.loggedOut && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    const delay = reconnectAttempts * 5000;
                    logger.info(`🔄 Reconnecting in ${delay/1000}s... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                    setTimeout(() => createBot(), delay);
                } else {
                    logger.info('❌ Logged out or max attempts reached');
                    process.exit(1);
                }
                
            } else if (connection === 'open') {
                isConnecting = false;
                reconnectAttempts = 0;
                
                logger.info('✅ Connected to WhatsApp successfully!');
                logger.info(`🤖 ${config.BOT_NAME} is online`);
                logger.info(`👤 Logged in as: ${sock.user?.name || 'Unknown'}`);
                
                // Save session to MongoDB after successful connection
                if (config.PERSIST_SESSIONS) {
                    setTimeout(async () => {
                        try {
                            await sessionManager.saveSession();
                            logger.info('💾 Session saved to MongoDB');
                        } catch (error) {
                            logger.warn('Could not save session to MongoDB:', error.message);
                        }
                    }, 10000);
                }
                
                // Send startup message
                if (config.OWNER_NUMBER && config.SEND_STARTUP_MESSAGE) {
                    setTimeout(async () => {
                        try {
                            const ownerJid = config.OWNER_NUMBER.replace(/\D/g, '') + '@s.whatsapp.net';
                            await sock.sendMessage(ownerJid, {
                                text: `🤖 *${config.BOT_NAME}* is online!\n\n` +
                                      `📅 ${new Date().toLocaleString()}\n` +
                                      `💾 Sessions: ${config.PERSIST_SESSIONS ? 'Persistent' : 'Temporary'}\n\n` +
                                      `Ready for commands! Type ${config.PREFIX}help`
                            });
                        } catch (error) {
                            logger.debug('Startup message failed:', error.message);
                        }
                    }, 15000);
                }
                
            } else if (connection === 'connecting') {
                logger.info('🔄 Connecting to WhatsApp...');
            }
        });
        
        // Event handlers
        sock.ev.on('messages.upsert', async (messageUpdate) => {
            try {
                await messageHandler.handle(messageUpdate);
            } catch (error) {
                logger.error('Message error:', error);
            }
        });
        
        sock.ev.on('group-participants.update', async (update) => {
            try {
                await eventHandler.handleGroupUpdate(update);
            } catch (error) {
                logger.error('Group update error:', error);
            }
        });
        
        sock.ev.on('messages.reaction', async (reaction) => {
            try {
                await eventHandler.handleReaction(reaction);
            } catch (error) {
                logger.error('Reaction error:', error);
            }
        });
        
        return sock;
        
    } catch (error) {
        isConnecting = false;
        logger.error('Bot creation error:', error);
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            setTimeout(() => createBot(), reconnectAttempts * 5000);
        } else {
            logger.error('❌ Max attempts reached');
            process.exit(1);
        }
    }
}
