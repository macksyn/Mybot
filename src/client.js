import makeWASocket, { 
    DisconnectReason, 
    useMultiFileAuthState, 
    makeCacheableSignalKeyStore,
    Browsers
} from '@whiskeysockets/baileys';
import pino from 'pino';
import NodeCache from 'node-cache';
import SessionManager from './utils/sessionManager.js';
import { config } from './config.js';

const logger = pino({ level: 'silent' });
const msgRetryCounterCache = new NodeCache();
const sessionManager = new SessionManager();

async function createBot() {
    try {
        console.log('🔑 Initializing session authentication...');
        
        let authState;
        const sessionString = config.SESSION_STRING;
        const sessionId = config.SESSION_ID || 'default';
        
        if (!sessionString) {
            throw new Error('❌ SESSION_STRING not found in environment variables');
        }

        console.log(`📝 Session String Preview: ${sessionString.substring(0, 20)}...`);
        console.log(`🆔 Session ID: ${sessionId}`);

        // Handle different session types (Mega.nz, direct string, or files)
        try {
            authState = await sessionManager.handleSession(sessionString, sessionId);
            console.log('✅ Session loaded successfully');
        } catch (error) {
            console.error('❌ Failed to load session:', error.message);
            throw error;
        }

        // Create WhatsApp socket
        const socket = makeWASocket({
            version: [2, 2413, 1],
            logger,
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            auth: {
                creds: authState.state.creds,
                keys: makeCacheableSignalKeyStore(authState.state.keys, logger)
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: undefined,
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            getMessage: async (key) => {
                if (store) {
                    const msg = await store.loadMessage(key.remoteJid, key.id);
                    return msg?.message || undefined;
                }
                return { conversation: 'Hello' };
            }
        });

        // Save credentials when updated
        socket.ev.on('creds.update', () => {
            try {
                authState.saveCreds();
                console.log('💾 Credentials updated and saved');
            } catch (error) {
                console.error('❌ Failed to save credentials:', error.message);
            }
        });

        // Connection state handler
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('📱 QR Code received, but session-based auth should not require QR');
            }
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                const reason = lastDisconnect?.error?.output?.statusCode;
                
                console.log('🔌 Connection closed due to:', {
                    reason: Object.keys(DisconnectReason)[Object.values(DisconnectReason).indexOf(reason)] || 'Unknown',
                    shouldReconnect
                });
                
                if (shouldReconnect) {
                    console.log('🔄 Reconnecting...');
                    setTimeout(() => createBot(), 5000);
                } else {
                    console.log('❌ Bot logged out. Please regenerate session.');
                    process.exit(1);
                }
            } else if (connection === 'open') {
                console.log('✅ Connected to WhatsApp');
                console.log(`📱 Bot Number: ${socket.user?.id || 'Unknown'}`);
                console.log(`👤 Bot Name: ${socket.user?.name || 'Unknown'}`);
                
                // Clean up old sessions periodically
                sessionManager.cleanupOldSessions();
            }
        });

        // Handle messages
        socket.ev.on('messages.upsert', async (m) => {
            try {
                const message = m.messages[0];
                if (!message.message) return;
                if (message.key.fromMe) return;
                if (message.key.remoteJid === 'status@broadcast') return;

                // Process the message (your existing message handler)
                await handleMessage(socket, message);
                
            } catch (error) {
                console.error('❌ Error handling message:', error);
            }
        });

        return socket;

    } catch (error) {
        console.error('❌ Failed to create bot:', error.message);
        
        // Provide helpful error messages
        if (error.message.includes('Mega download failed')) {
            console.log('💡 Tips for Mega.nz issues:');
            console.log('   • Make sure the Mega link is public and accessible');
            console.log('   • Check if the file contains valid session data');
            console.log('   • Try regenerating the session if the link is old');
        } else if (error.message.includes('Invalid session')) {
            console.log('💡 Tips for session issues:');
            console.log('   • Make sure SESSION_STRING is correctly set');
            console.log('   • Check if the session format is supported');
            console.log('   • Try using a fresh session from your generator');
        }
        
        throw error;
    }
}

async function handleMessage(socket, message) {
    // Your existing message handling logic here
    // This is where you'd put your command processing, AI responses, etc.
    
    const messageText = message.message?.conversation || 
                       message.message?.extendedTextMessage?.text || '';
    
    if (messageText.startsWith(config.PREFIX)) {
        // Handle commands
        const cmd = messageText.slice(config.PREFIX.length).trim().toLowerCase();
        const jid = message.key.remoteJid;
        
        // Example: Session test command
        if (cmd === 'sessiontest') {
            const sessionPath = `./sessions/${config.SESSION_ID || 'default'}`;
            const validation = await sessionManager.validateSession(sessionPath);
            
            const response = validation.valid 
                ? '✅ Session is valid and working!'
                : `❌ Session error: ${validation.error}`;
                
            await socket.sendMessage(jid, { text: response });
        }
        
        // Add your other commands here...
    }
}

export { createBot };
