import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
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
            logger.info('QR Code received, scan with WhatsApp:');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            
            logger.info('Connection closed due to:', lastDisconnect?.error);
            
            if (shouldReconnect) {
                logger.info('Reconnecting...');
                setTimeout(() => createBot(), 3000);
            } else {
                logger.info('Logged out, please restart and scan QR code again');
                process.exit(0);
            }
        } else if (connection === 'open') {
            logger.info('✅ Connected to WhatsApp!');
            
            // Send startup message to owner
            if (config.OWNER_NUMBER) {
                try {
                    await sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                        text: `🤖 *${config.BOT_NAME}* is now online!\n\n` +
                              `📅 Started: ${new Date().toLocaleString()}\n` +
                              `🔧 Prefix: ${config.PREFIX}\n` +
                              `🌐 Environment: ${config.NODE_ENV}\n\n` +
                              `Type ${config.PREFIX}help to see available commands.`
                    });
                } catch (error) {
                    logger.warn('Could not send startup message to owner:', error.message);
                }
            }
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
