import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { logger } from './utils/logger.js';
import { config } from './config/config.js';
import { MessageHandler } from './handlers/messageHandler.js';
import { EventHandler } from './handlers/eventHandler.js';

export async function createBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./sessions');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    logger.info(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);
    
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: logger.child({ module: 'baileys' }),
        browser: ['WhatsApp Bot', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: true,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        emitOwnEvents: false,
        getMessage: async (key) => {
            return { conversation: 'Hello!' };
        }
    });
    
    // Initialize handlers
    const messageHandler = new MessageHandler(sock);
    const eventHandler = new EventHandler(sock);
    
    // Connection events
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            if (config.USE_PAIRING_CODE && config.OWNER_NUMBER) {
                // Use pairing code instead of QR
                logger.info('🔗 Generating pairing code...');
                try {
                    const code = await sock.requestPairingCode(config.OWNER_NUMBER);
                    logger.info(`📱 Your pairing code: ${code}`);
                    logger.info(`📞 Enter this code in WhatsApp > Linked Devices > Link a Device > Link with phone number instead`);
                    
                    // If we have a way to send notifications, send the pairing code
                    if (config.WEBHOOK_URL) {
                        await sendPairingCodeNotification(code);
                    }
                } catch (error) {
                    logger.error('Failed to generate pairing code:', error);
                    logger.info('Falling back to QR code...');
                    qrcode.generate(qr, { small: true });
                }
            } else {
                logger.info('📱 QR Code received, scan with WhatsApp:');
                qrcode.generate(qr, { small: true });
                
                if (config.NODE_ENV === 'production') {
                    logger.warn('⚠️  Running in production without pairing code setup!');
                    logger.info('💡 Set USE_PAIRING_CODE=true and OWNER_NUMBER in environment variables for easier deployment');
                }
            }
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            
            logger.info('Connection closed due to:', lastDisconnect?.error);
            
            if (shouldReconnect) {
                logger.info('🔄 Reconnecting in 3 seconds...');
                setTimeout(() => createBot(), 3000);
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
            logger.info('✅ Connected to WhatsApp successfully!');
            logger.info(`🤖 ${config.BOT_NAME} is now online and ready!`);
            
            // Send startup message to owner
            if (config.OWNER_NUMBER && config.SEND_STARTUP_MESSAGE) {
                try {
                    await sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                        text: `🤖 *${config.BOT_NAME}* is now online!\n\n` +
                              `📅 Started: ${new Date().toLocaleString()}\n` +
                              `🔧 Prefix: ${config.PREFIX}\n` +
                              `🌐 Environment: ${config.NODE_ENV}\n` +
                              `⚡ Node.js: ${process.version}\n\n` +
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
        await messageHandler.handle(messageUpdate);
    });
    
    // Other events
    sock.ev.on('group-participants.update', async (update) => {
        await eventHandler.handleGroupUpdate(update);
    });
    
    sock.ev.on('messages.reaction', async (reaction) => {
        await eventHandler.handleReaction(reaction);
    });
    
    // Presence update
    setInterval(async () => {
        try {
            await sock.sendPresenceUpdate('available');
        } catch (error) {
            // Ignore presence update errors
        }
    }, 60000); // Update presence every minute
    
    return sock;
}

// Helper function to send pairing code notification
async function sendPairingCodeNotification(code) {
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
