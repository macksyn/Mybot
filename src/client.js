import { makeWASocket, DisconnectReason, BufferJSON, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { logger } from './utils/logger.js';
import { config } from './config/config.js';
import { MessageHandler } from './handlers/messageHandler.js';
import { EventHandler } from './handlers/eventHandler.js';
import fs from 'fs';
import path from 'path';
import { sessionStringToAuth, authToSessionString, validateSessionString } from './utils/sessionManager.js';

export async function createBot() {
    let authState;
    let saveCreds;
    
    // Check if we have a session string or need to use file-based auth
    if (config.SESSION_STRING && config.SESSION_STRING !== 'your-session-string-here') {
        logger.info('🔑 Using session string authentication');
        
        // Validate session string first
        const validation = validateSessionString(config.SESSION_STRING);
        if (!validation.valid) {
            logger.error(`❌ Session validation failed: ${validation.error}`);
            throw new Error(`Invalid session string: ${validation.error}`);
        }
        
        logger.info(`📝 Session Type: ${validation.type}`);
        logger.info(`📝 Session Preview: ${config.SESSION_STRING.substring(0, 20)}...`);
        
        try {
            // Convert session string to auth state (handles Mega.nz downloads)
            if (validation.type === 'mega') {
                logger.info('🔗 Processing Mega.nz session...');
                logger.info('⏳ This may take a moment to download...');
            }
            
            authState = await sessionStringToAuth(config.SESSION_STRING);
            logger.info('✅ Session string loaded successfully');
            
            // Create a save function that can optionally convert back to session string
            saveCreds = async () => {
                try {
                    // Save to session directory if persistence is enabled
                    if (config.PERSIST_SESSIONS) {
                        const sessionPath = path.join('./sessions', config.SESSION_ID);
                        if (!fs.existsSync(sessionPath)) {
                            fs.mkdirSync(sessionPath, { recursive: true });
                        }
                        
                        // Save creds to file for backup
                        const credsPath = path.join(sessionPath, 'creds.json');
                        fs.writeFileSync(credsPath, JSON.stringify(authState.state.creds, BufferJSON.replacer, 2));
                        logger.debug('💾 Session backed up to file');
                    }
                } catch (error) {
                    logger.debug('Could not save session backup:', error.message);
                }
            };
            
        } catch (error) {
            logger.error('❌ Failed to load session string:', error.message);
            
            // Provide specific error guidance
            if (error.message.includes('Mega.nz')) {
                logger.error('🔧 Mega.nz Session Issues:');
                logger.error('   • Check your internet connection');
                logger.error('   • Verify the Mega.nz link is still valid');
                logger.error('   • Try generating a new session');
                logger.error('   • Run: npm run test:session to debug');
            } else if (error.message.includes('JSON') || error.message.includes('parse')) {
                logger.error('🔧 Session Format Issues:');
                logger.error('   • Session data may be corrupted');
                logger.error('   • Generate a new session string');
                logger.error('   • Check session generator output');
            } else {
                logger.error('🔧 Please check your SESSION_STRING in .env file');
                logger.error('💡 Run: npm run test:session to validate');
            }
            
            throw new Error(`Session loading failed: ${error.message}`);
        }
        
    } else {
        logger.info('📁 Using file-based session authentication');
        
        // Fall back to file-based authentication
        const sessionPath = path.join('./sessions', config.SESSION_ID);
        
        // Ensure session directory exists
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
            logger.info(`Created session directory: ${sessionPath}`);
        }
        
        // Check if session files exist
        const hasSession = fs.existsSync(path.join(sessionPath, 'creds.json'));
        
        if (!hasSession) {
            logger.error('❌ No session found!');
            logger.error(`📁 Looking for session in: ${sessionPath}`);
            logger.error('🔧 Please either:');
            logger.error('   1. Set SESSION_STRING in your .env file, OR');
            logger.error('   2. Copy session files to the session directory');
            logger.error('');
            logger.error('💡 To get a session string:');
            logger.error('   - Use your session generator');
            logger.error('   - Get the session ID (like "Groq~fileId#key")');
            logger.error('   - Set SESSION_STRING=your-session-string in .env');
            logger.error('   - Run: npm run test:session to validate');
            
            throw new Error('No session available. Please set SESSION_STRING or provide session files.');
        }
        
        logger.info(`📁 Loading session from: ${sessionPath}`);
        const { state, saveCreds: fileSaveCreds } = await useMultiFileAuthState(sessionPath);
        authState = { state };
        saveCreds = fileSaveCreds;
    }
    
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    logger.info(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);
    logger.info(`🆔 Session ID: ${config.SESSION_ID}`);
    
    const sock = makeWASocket({
        version,
        auth: authState.state,
        printQRInTerminal: false, // Disabled since we're using session
        logger: logger.child({ module: 'baileys' }),
        browser: ['Groq Bot', 'Chrome', '3.0.0'],
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
            logger.warn('⚠️ QR code received - this should not happen with session-based auth');
            logger.warn('🔧 This indicates the session might be invalid or expired');
            logger.warn('💡 You may need to regenerate your session string');
            logger.warn('🔗 Run: npm run test:session to validate your session');
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            
            logger.info('Connection closed due to:', lastDisconnect?.error);
            logger.info('Status Code:', statusCode);
            
            if (statusCode === DisconnectReason.loggedOut) {
                logger.error('❌ Session has been logged out remotely');
                logger.error('🔧 You need to generate a new session string');
                logger.error('💡 Use your session generator to get a new SESSION_STRING');
                logger.error('🔗 After getting new session, run: npm run test:session');
                
                if (config.AUTO_RESTART_ON_LOGOUT) {
                    logger.info('🔄 Auto-restart disabled for logged out sessions');
                }
                process.exit(1);
            } else if (statusCode === DisconnectReason.restartRequired) {
                logger.info('🔄 Restart required by WhatsApp');
                setTimeout(() => createBot(), 3000);
            } else if (statusCode === DisconnectReason.connectionClosed) {
                logger.info('🔄 Connection closed, reconnecting in 5 seconds...');
                setTimeout(() => createBot(), 5000);
            } else if (statusCode === DisconnectReason.connectionLost) {
                logger.info('🔄 Connection lost, reconnecting in 3 seconds...');
                setTimeout(() => createBot(), 3000);
            } else if (shouldReconnect) {
                logger.info('🔄 Reconnecting in 5 seconds...');
                setTimeout(() => createBot(), 5000);
            } else {
                logger.error('❌ Connection lost permanently');
                logger.error('💡 Try regenerating your session if this persists');
                process.exit(1);
            }
        } else if (connection === 'open') {
            logger.info('✅ Connected to WhatsApp successfully!');
            logger.info(`🤖 ${config.BOT_NAME} is now online and ready!`);
            logger.info(`🆔 Using Session: ${config.SESSION_ID}`);
            
            // Get bot's own number for logging
            try {
                const botNumber = sock.user?.id?.split(':')[0];
                logger.info(`📱 Bot Number: ${botNumber}`);
                
                // Log successful auth method
                const authMethod = config.SESSION_STRING && config.SESSION_STRING !== 'your-session-string-here' ? 
                    (config.SESSION_STRING.includes('#') ? 'Mega.nz Session' : 'Session String') : 'Session Files';
                logger.info(`🔑 Auth Method: ${authMethod}`);
                
            } catch (error) {
                logger.debug('Could not extract bot number:', error.message);
            }
            
            // Send startup message to owner
            if (config.OWNER_NUMBER && config.SEND_STARTUP_MESSAGE) {
                try {
                    const authMethod = config.SESSION_STRING && config.SESSION_STRING !== 'your-session-string-here' ? 
                        (config.SESSION_STRING.includes('#') ? 'Mega.nz Session' : 'Session String') : 'Session Files';
                    
                    const startupMessage = `🤖 *${config.BOT_NAME}* is now online!\n\n` +
                                          `📅 Started: ${new Date().toLocaleString()}\n` +
                                          `🆔 Session: ${config.SESSION_ID}\n` +
                                          `🔑 Auth: ${authMethod}\n` +
                                          `🔧 Prefix: ${config.PREFIX}\n` +
                                          `🌐 Environment: ${config.NODE_ENV}\n` +
                                          `⚡ Node.js: ${process.version}\n` +
                                          `📱 Bot Number: ${sock.user?.id?.split(':')[0] || 'Unknown'}\n\n` +
                                          `✅ All systems operational!\n` +
                                          `Type ${config.PREFIX}help for commands.\n` +
                                          `Type ${config.PREFIX}sessiontest to test session.`;
                    
                    await sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                        text: startupMessage
                    });
                    logger.info('📨 Startup notification sent to owner');
                } catch (error) {
                    logger.warn('Could not send startup message to owner:', error.message);
                }
            }
            
            // Log session health
            logSessionHealth();
            
        } else if (connection === 'connecting') {
            const authMethod = config.SESSION_STRING && config.SESSION_STRING !== 'your-session-string-here' ? 
                (config.SESSION_STRING.includes('#') ? 'Mega.nz session' : 'session string') : 'session files';
            logger.info(`🔄 Connecting to WhatsApp using ${authMethod}...`);
        }
    });
    
    // Credentials update - save any session updates
    sock.ev.on('creds.update', async () => {
        try {
            await saveCreds();
            logger.debug('📄 Session credentials updated');
        } catch (error) {
            logger.error('Failed to save credentials:', error);
        }
    });
    
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

// Helper function to log session health
function logSessionHealth() {
    try {
        if (config.SESSION_STRING && config.SESSION_STRING !== 'your-session-string-here') {
            const sessionType = config.SESSION_STRING.includes('#') ? 'Mega.nz' : 'Direct';
            logger.info(`📊 Session Health: Using ${sessionType} authentication`);
            logger.debug(`Session string length: ${config.SESSION_STRING.length} characters`);
            
            if (sessionType === 'Mega.nz') {
                logger.info('💡 Mega.nz sessions are cached locally for faster restarts');
            }
        } else {
            const sessionPath = path.join('./sessions', config.SESSION_ID);
            if (fs.existsSync(sessionPath)) {
                const files = fs.readdirSync(sessionPath);
                const sessionFiles = files.filter(file => 
                    file.endsWith('.json') && 
                    (file.startsWith('app-state-sync') || 
                     file.startsWith('pre-key') || 
                     file.startsWith('sender-key') || 
                     file.startsWith('session') || 
                     file === 'creds.json')
                );
                
                logger.info(`📊 Session Health: ${sessionFiles.length} files loaded`);
                logger.debug('Session files:', sessionFiles.join(', '));
            }
        }
    } catch (error) {
        logger.warn('Could not check session health:', error.message);
    }
}
