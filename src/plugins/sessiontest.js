// Session test plugin for debugging and validation
import { config } from '../config/config.js';
import { validateSessionString, getSessionInfo } from '../utils/sessionManager.js';

const sessionTestPlugin = {
    name: 'sessiontest',
    description: 'Test and validate session string configuration',
    usage: '!sessiontest',
    category: 'debug',
    adminOnly: true,
    
    async execute(context) {
        const { reply, senderId } = context;
        const { isOwner, isAdmin } = await import('../utils/helpers.js');
        
        // Check permissions
        if (!isOwner(senderId) && !isAdmin(senderId)) {
            await reply('❌ This command requires admin permissions.');
            return;
        }
        
        try {
            let testResults = '🔍 *Session Configuration Test*\n\n';
            
            // Test 1: Basic configuration
            testResults += '📋 *Configuration Check:*\n';
            testResults += `• BOT_NAME: ${config.BOT_NAME}\n`;
            testResults += `• SESSION_ID: ${config.SESSION_ID}\n`;
            testResults += `• Using Session String: ${config.isUsingSessionString() ? '✅ YES' : '❌ NO'}\n\n`;
            
            // Test 2: Session string validation
            if (config.isUsingSessionString()) {
                testResults += '🔑 *Session String Analysis:*\n';
                
                const sessionString = config.SESSION_STRING;
                testResults += `• Length: ${sessionString.length} characters\n`;
                testResults += `• Preview: ${sessionString.substring(0, 20)}...\n`;
                
                // Validate session string
                const validation = validateSessionString(sessionString);
                testResults += `• Validation: ${validation.valid ? '✅ VALID' : '❌ INVALID'}\n`;
                
                if (!validation.valid) {
                    testResults += `• Error: ${validation.error}\n`;
                } else {
                    // Get session info
                    try {
                        const sessionInfo = getSessionInfo(sessionString);
                        testResults += `• Has Credentials: ${sessionInfo.hasCredentials ? '✅' : '❌'}\n`;
                        testResults += `• Has Keys: ${sessionInfo.hasKeys ? '✅' : '❌'}\n`;
                        testResults += `• Registered: ${sessionInfo.registered ? '✅' : '❌'}\n`;
                        testResults += `• Phone Number: ${sessionInfo.phoneNumber}\n`;
                    } catch (infoError) {
                        testResults += `• Info Error: ${infoError.message}\n`;
                    }
                }
                testResults += '\n';
            } else {
                testResults += '📁 *File-Based Session:*\n';
                testResults += '• Method: Traditional file-based authentication\n';
                testResults += `• Session Path: ${config.getSessionPath()}\n\n`;
            }
            
            // Test 3: Environment recommendations
            testResults += '💡 *Recommendations:*\n';
            
            if (!config.isUsingSessionString()) {
                testResults += '• Consider using SESSION_STRING for easier deployment\n';
                testResults += '• Session strings are more portable than files\n';
            } else {
                testResults += '• ✅ Using recommended session string method\n';
            }
            
            if (config.SESSION_STRING === 'your-session-string-here') {
                testResults += '• ⚠️ Replace placeholder SESSION_STRING with actual value\n';
            }
            
            if (config.NODE_ENV === 'production' && !config.OWNER_NUMBER) {
                testResults += '• ⚠️ Set OWNER_NUMBER for production deployment\n';
            }
            
            testResults += '\n';
            
            // Test 4: Quick setup guide
            if (config.SESSION_STRING === 'your-session-string-here') {
                testResults += '🔧 *Quick Setup:*\n';
                testResults += '1. Use your session generator\n';
                testResults += '2. Get session string (like "malvin~ABC...")\n';
                testResults += '3. Set SESSION_STRING in .env file\n';
                testResults += '4. Restart the bot\n\n';
            } else {
                testResults += '✅ *Setup Complete:*\n';
                testResults += 'Session configuration looks good!\n';
                testResults += 'Bot should connect automatically.\n\n';
            }
            
            // Test 5: Connection status
            testResults += '🌐 *Connection Status:*\n';
            testResults += `• Bot Status: ${context.sock.user ? '🟢 Connected' : '🟡 Connecting'}\n`;
            if (context.sock.user) {
                testResults += `• Bot Number: ${context.sock.user.id.split(':')[0]}\n`;
                testResults += `• Connection Type: ${context.sock.type || 'Unknown'}\n`;
            }
            
            await reply(testResults);
            
        } catch (error) {
            console.error('Session test error:', error);
            await reply(`❌ Session test failed: ${error.message}`);
        }
    }
};

export default sessionTestPlugin;
