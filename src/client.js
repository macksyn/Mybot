import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, delay, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { logger } from './utils/logger.js';
import { config } from './config/config.js';
import { MessageHandler } from './handlers/messageHandler.js';
import { EventHandler } from './handlers/eventHandler.js';

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
            getMessage: async (key) => {
                return { conversation: 'Hello!' };
            }
        });
        
        // Initialize handlers
        const messageHandler = new MessageHandler(sock);
        const eventHandler = new EventHandler(sock);
        
        // Handle pairing code generation - similar to working implementation
        if (config.USE_PAIRING_CODE && config.OWNER_NUMBER && !sock.authState.creds.registered) {
            logger.info('🔗 Bot not registered, preparing pairing code...');
            
            // Add delay before requesting pairing code (like the working implementation)
            await delay(1500);
            
            try {
                const phoneNumber = config.OWNER_NUMBER.replace(/\D/g, '');
                logger.info(`📱 Requesting pairing code for: ${phoneNumber}`);
                
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
        
        // Connection events
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            logger.info(`Connection update: ${connection}`);
            
            if (qr && !config.USE_PAIRING_CODE) {
                logger.info('📱 QR Code received, scan with WhatsApp:');
                qrcode.generate(qr, { small: true });
                
                if (config.NODE_ENV === 'production') {
                    logger.warn('⚠️  Running in production without pairing code setup!');
                    logger.info('💡 Set USE_PAIRING_CODE=true and OWNER_NUMBER in environment variables for easier deployment');
                }
            }
            
            if (connection === 'close') {
                isConnecting = false;
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                logger.info(`Connection closed. Status code: ${statusCode}`);
                logger.info('Disconnect reason:', lastDisconnect?.error?.message || 'Unknown');
                
                if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    const delay = Math.min(reconnectAttempts * 2000, 10000); // Exponential backoff, max 10s
                    
                    logger.info(`🔄 Reconnecting in ${delay/1000} seconds... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                    setTimeout(() => createBot(), delay);
                } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    logger.error('❌ Max reconnection attempts reached. Manual restart required.');
                    process.exit(1);
                } else {
                    logger.info('❌ Logged out. Please restart the bot to authenticate again.');
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
                
                // Send startup message to owner
                if (config.OWNER_NUMBER && config.SEND_STARTUP_MESSAGE) {
                    try {
                        // Add delay before sending startup message
                        await delay(2000);
                        
                        const ownerJid = config.OWNER_NUMBER.replace(/\D/g, '') + '@s.whatsapp.net';
                        await sock.sendMessage(ownerJid, {
                            text: `🤖 *${config.BOT_NAME}* is now online!\n\n` +
                                  `📅 Started: ${new Date().toLocaleString()}\n` +
                                  `🔧 Prefix: ${config.PREFIX}\n` +
                                  `🌐 Environment: ${config.NODE_ENV}\n` +
                                  `⚡ Node.js: ${process.version}\n` +
                                  `👤 Connected as: ${sock.user?.name || 'Bot'}\n\n` +
                                  `✅ All systems operational!\n` +
                                  `Type ${config.PREFIX}help to see available commands.`
                        });
                        logger.info('📨 Startup notification sent to owner');
                    } catch (error) {
                        logger.warn('Could not send startup message to owner:', error.message);
                    }
                }
            } else if (connection === 'connecting') {
                logger.info('🔄 Connecting to WhatsApp...');
            }
        });
        
        // Credentials update
        sock.ev.on('creds.update', saveCreds);
        
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
        
        // Presence update with connection check
        const presenceInterval = setInterval(async () => {
            try {
                if (sock.ws?.readyState === 1 && connection === 'open') {
                    await sock.sendPresenceUpdate('available');
                }
            } catch (error) {
                // Ignore presence update errors
            }
        }, 60000);
        
        // Clean up interval on disconnect
        sock.ev.on('connection.update', (update) => {
            if (update.connection === 'close') {
                clearInterval(presenceInterval);
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
