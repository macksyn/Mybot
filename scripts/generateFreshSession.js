#!/usr/bin/env node
// Session Regeneration Helper
import 'dotenv/config';
import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { logger } from '../src/utils/logger.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';

/**
 * Generate a fresh session by scanning QR code
 * This creates a clean session without any conflicts
 */
async function generateFreshSession() {
    console.log('🔄 Fresh Session Generator');
    console.log('==========================\n');
    
    const tempSessionPath = './temp_session';
    
    try {
        // Clean up any existing temp session
        if (fs.existsSync(tempSessionPath)) {
            console.log('🧹 Cleaning up existing temp session...');
            fs.rmSync(tempSessionPath, { recursive: true, force: true });
        }
        
        // Create temp session directory
        fs.mkdirSync(tempSessionPath, { recursive: true });
        console.log(`📁 Created temp session directory: ${tempSessionPath}\n`);
        
        // Set up auth state
        const { state, saveCreds } = await useMultiFileAuthState(tempSessionPath);
        
        // Get latest Baileys version
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📱 Using Baileys v${version.join('.')}, isLatest: ${isLatest}\n`);
        
        // Create socket
        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false, // We'll handle QR display manually
            logger: logger.child({ module: 'session-generator' }),
            browser: ['Session Generator', 'Chrome', '3.0.0'],
            generateHighQualityLinkPreview: false,
            markOnlineOnConnect: false,
            emitOwnEvents: false,
            defaultQueryTimeoutMs: 60000,
            getMessage: async (key) => {
                return { conversation: 'Hello!' };
            }
        });
        
        let qrDisplayed = false;
        let connectionAttempts = 0;
        const maxAttempts = 3;
        
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr && !qrDisplayed) {
                console.log('📱 QR Code for WhatsApp Web:');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                qrcode.generate(qr, { small: true });
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('\n📋 Instructions:');
                console.log('1. Open WhatsApp on your phone');
                console.log('2. Go to Settings > Linked Devices');
                console.log('3. Tap "Link a Device"');
                console.log('4. Scan the QR code above\n');
                console.log('⏳ Waiting for QR scan...\n');
                qrDisplayed = true;
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                console.log(`❌ Connection closed: ${lastDisconnect?.error}`);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.error('❌ Logged out - session generation failed');
                    process.exit(1);
                } else if (shouldReconnect && connectionAttempts < maxAttempts) {
                    connectionAttempts++;
                    console.log(`🔄 Reconnecting... (${connectionAttempts}/${maxAttempts})`);
                    setTimeout(() => generateFreshSession(), 3000);
                } else {
                    console.error('❌ Connection failed permanently');
                    process.exit(1);
                }
            } else if (connection === 'open') {
                console.log('✅ Connected to WhatsApp successfully!\n');
                
                // Get session info
                const botNumber = sock.user?.id?.split(':')[0];
                const isRegistered = sock.user?.id ? true : false;
                
                console.log('📊 Session Information:');
                console.log(`   📱 Phone Number: ${botNumber}`);
                console.log(`   ✅ Registration: ${isRegistered ? 'Active' : 'Pending'}`);
                console.log(`   🔑 Credentials: Generated`);
                console.log(`   📁 Location: ${tempSessionPath}\n`);
                
                // Save the session
                await saveCreds();
                
                // Convert to session string format
                console.log('🔄 Converting to session string format...\n');
                
                try {
                    const credsFile = path.join(tempSessionPath, 'creds.json');
                    if (fs.existsSync(credsFile)) {
                        const creds = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));
                        
                        // Create session data in proper format
                        const sessionData = {
                            creds: creds,
                            keys: {} // New session starts with empty keys
                        };
                        
                        // Convert to base64 session string
                        const sessionString = Buffer.from(JSON.stringify(sessionData)).toString('base64');
                        const prefixedSessionString = `Groq~${sessionString}`;
                        
                        console.log('✅ Session String Generated!\n');
                        console.log('📋 Your New Session String:');
                        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                        console.log(prefixedSessionString);
                        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                        
                        // Save to file for backup
                        const outputFile = './new_session_string.txt';
                        fs.writeFileSync(outputFile, prefixedSessionString);
                        console.log(`💾 Session string saved to: ${outputFile}\n`);
                        
                        console.log('🔧 Next Steps:');
                        console.log('1. Copy the session string above');
                        console.log('2. Update your .env file:');
                        console.log(`   SESSION_STRING=${prefixedSessionString}`);
                        console.log('3. Restart your bot with: npm start\n');
                        
                        console.log('⚠️  Important Notes:');
                        console.log('• Keep this session string secure and private');
                        console.log('• This session string will work immediately');
                        console.log('• No Mega.nz upload needed - direct format');
                        console.log('• Delete the temp session folder when done\n');
                        
                    } else {
                        console.error('❌ Could not find credentials file');
                    }
                    
                } catch (error) {
                    console.error('❌ Failed to create session string:', error.message);
                }
                
                // Clean up and exit
                setTimeout(() => {
                    console.log('🧹 Cleaning up temp session...');
                    try {
                        if (fs.existsSync(tempSessionPath)) {
                            fs.rmSync(tempSessionPath, { recursive: true, force: true });
                        }
                        console.log('✅ Cleanup complete!');
                    } catch (cleanupError) {
                        console.warn('⚠️ Manual cleanup required for:', tempSessionPath);
                    }
                    
                    sock.end();
                    process.exit(0);
                }, 5000);
            }
        });
        
        sock.ev.on('creds.update', saveCreds);
        
        // Timeout after 5 minutes
        setTimeout(() => {
            console.error('❌ Timeout: QR code not scanned within 5 minutes');
            console.log('💡 Please try again and scan the QR code more quickly');
            process.exit(1);
        }, 300000); // 5 minutes
        
    } catch (error) {
        console.error('❌ Session generation failed:', error.message);
        
        // Clean up on error
        try {
            if (fs.existsSync(tempSessionPath)) {
                fs.rmSync(tempSessionPath, { recursive: true, force: true });
            }
        } catch (cleanupError) {
            console.warn('⚠️ Manual cleanup required for:', tempSessionPath);
        }
        
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n❌ Session generation cancelled by user');
    console.log('🧹 Cleaning up...');
    
    try {
        const tempSessionPath = './temp_session';
        if (fs.existsSync(tempSessionPath)) {
            fs.rmSync(tempSessionPath, { recursive: true, force: true });
        }
    } catch (error) {
        console.warn('⚠️ Manual cleanup may be required');
    }
    
    process.exit(0);
});

// Start session generation
console.log('🚀 Starting fresh session generation...\n');
generateFreshSession().catch(error => {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
});
