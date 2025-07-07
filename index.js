// index.js
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
require('dotenv').config();

async function startBot() {
    // Load or create session data
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_multi');

    // Initialize WhatsApp socket
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), // Change to 'debug' for more logs
        printQRInTerminal: false, // Use pairing code
    });

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, pairingCode } = update;

        if (pairingCode) {
            console.log('Pairing Code:', pairingCode);
            // Optionally save pairing code to a file or send via API
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed:', lastDisconnect?.error?.message);
            if (shouldReconnect) {
                console.log('Reconnecting...');
                startBot();
            } else {
                console.log('Logged out. Re-authenticate with a new pairing code.');
            }
        } else if (connection === 'open') {
            console.log('Connected to WhatsApp!');
        }
    });

    // Save session credentials
    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return; // Ignore own messages

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        console.log(`Message from ${from}: ${text}`);

        // Example command: Reply to "!hi" with "Hello!"
        if (text.toLowerCase() === '!hi') {
            await sock.sendMessage(from, { text: 'Hello!' });
        }
    });

    // Request pairing code if not authenticated
    const phoneNumber = process.env.PHONE_NUMBER;
    if (!sock.authState.creds.registered && phoneNumber) {
        console.log('Requesting pairing code...');
        const pairingCode = await sock.requestPairingCode(phoneNumber);
        console.log('Enter this code in WhatsApp:', pairingCode);
    } else if (!phoneNumber) {
        console.log('Error: PHONE_NUMBER not set in .env');
    }
}

startBot().catch((err) => {
    console.error('Error starting bot:', err);
});
