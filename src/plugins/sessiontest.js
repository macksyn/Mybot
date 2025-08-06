// src/plugins/sessiontest.js
import { config } from '../config/config.js';
import { validateSessionString, getSessionInfo, testSession } from '../utils/sessionManager.js';

export default {
    name: 'sessiontest',
    description: 'Test and validate current session configuration',
    usage: `${config.PREFIX}sessiontest`,
    category: 'debug',
    adminOnly: false,
    
    async execute(context) {
        const { reply, react } = context;
        
        try {
            await react('🔍');
            
            const sessionString = config.SESSION_STRING;
            
            if (!sessionString || sessionString === 'your-session-string-here') {
                await reply('❌ *Session Test Failed*\n\n' +
                           '🔧 No valid session string found.\n\n' +
                           '💡 *Setup Instructions:*\n' +
                           '1. Get session from your generator\n' +
                           '2. Set SESSION_STRING in .env file\n' +
                           '3. Restart the bot\n\n' +
                           'Current session string is placeholder or empty.');
                return;
            }
            
            // Basic validation
            const validation = validateSessionString(sessionString);
            
            let response = '*🔍 Session Test Results*\n\n';
            response += `*📝 Session Info:*\n`;
            response += `• Session ID: \`${config.SESSION_ID}\`\n`;
            response += `• String Length: ${sessionString.length} chars\n`;
            response += `• Format: ${validation.valid ? '✅ Valid' : '❌ Invalid'}\n`;
            
            if (!validation.valid) {
                response += `• Error: ${validation.error}\n\n`;
                response += '🔧 *Fix Required:*\n';
                response += '• Check your SESSION_STRING format\n';
                response += '• Generate a new session if needed\n';
                response += '• Ensure proper copying from generator';
                
                await reply(response);
                await react('❌');
                return;
            }
            
            // Get session info
            const info = getSessionInfo(sessionString);
            response += `• Type: ${info.type}\n`;
            response += `• Phone: ${info.phoneNumber}\n`;
            response += `• Has Creds: ${info.hasCredentials ? '✅' : '❌'}\n`;
            response += `• Has Keys: ${info.hasKeys ? '✅' : '❌'}\n\n`;
            
            await reply(response);
            
            // Connectivity test for Mega sessions
            if (validation.type === 'mega') {
                await reply('🔗 *Testing Mega.nz Connection...*\n\nThis may take a few moments...');
                
                try {
                    const testResult = await testSession(sessionString);
                    
                    if (testResult.success) {
                        let successMsg = '✅ *Mega.nz Test Successful!*\n\n';
                        successMsg += `*📊 Connection Details:*\n`;
                        successMsg += `• Download: ✅ Success\n`;
                        successMsg += `• Credentials: ${testResult.hasCredentials ? '✅' : '❌'}\n`;
                        successMsg += `• Phone: ${testResult.phoneNumber || 'Unknown'}\n\n`;
                        successMsg += '🎉 Your session is working perfectly!\n';
                        successMsg += '🚀 Bot should connect without issues.';
                        
                        await reply(successMsg);
                        await react('✅');
                    } else {
                        let errorMsg = '❌ *Mega.nz Test Failed*\n\n';
                        errorMsg += `*🐛 Error Details:*\n`;
                        errorMsg += `${testResult.error}\n\n`;
                        
                        // Provide specific help based on error type
                        if (testResult.error.includes('network') || testResult.error.includes('ENOTFOUND')) {
                            errorMsg += '🌐 *Network Issue:*\n';
                            errorMsg += '• Check internet connection\n';
                            errorMsg += '• Try again in a moment\n';
                            errorMsg += '• Verify Mega.nz accessibility';
                        } else if (testResult.error.includes('not found') || testResult.error.includes('404')) {
                            errorMsg += '📁 *File Issue:*\n';
                            errorMsg += '• Session file may be deleted\n';
                            errorMsg += '• Generate new session\n';
                            errorMsg += '• Check file ID and key';
                        } else if (testResult.error.includes('JSON') || testResult.error.includes('credentials')) {
                            errorMsg += '📋 *Format Issue:*\n';
                            errorMsg += '• Invalid session data format\n';
                            errorMsg += '• Generate new session\n';
                            errorMsg += '• Check session generator';
                        } else {
                            errorMsg += '🔧 *General Issue:*\n';
                            errorMsg += '• Try generating new session\n';
                            errorMsg += '• Contact session generator support\n';
                            errorMsg += '• Check session format';
                        }
                        
                        await reply(errorMsg);
                        await react('❌');
                    }
                } catch (testError) {
                    await reply(`❌ *Test Error*\n\n${testError.message}\n\n🔧 Try generating a new session.`);
                    await react('❌');
                }
            } else {
                // For direct sessions, just confirm parsing works
                let directMsg = '📝 *Direct Session Test*\n\n';
                directMsg += '✅ Session parsing successful\n';
                directMsg += '🔧 Format is compatible\n\n';
                directMsg += '🎉 Your session should work correctly!';
                
                await reply(directMsg);
                await react('✅');
            }
            
        } catch (error) {
            await reply(`❌ *Session Test Error*\n\n${error.message}\n\n🔧 Please check your session configuration.`);
            await react('❌');
        }
    }
};
