import { isOwner } from '../utils/helpers.js';
import { config } from '../config/config.js';

export default {
    name: 'pair',
    description: 'Generate a new pairing code for WhatsApp authentication',
    usage: '!pair [phone_number]',
    category: 'admin',
    
    async execute(context) {
        const { reply, args, senderId, sock, react } = context;
        
        // Only owner can use pairing commands
        if (!isOwner(senderId)) {
            await reply('❌ Only the bot owner can use pairing commands.');
            return;
        }
        
        await react('🔗');
        
        try {
            let phoneNumber;
            
            if (args.length > 0) {
                // Use provided phone number
                phoneNumber = args[0].replace(/\D/g, ''); // Remove non-digits
                
                if (phoneNumber.length < 10 || phoneNumber.length > 15) {
                    await reply('❌ Invalid phone number format. Please provide a valid phone number (10-15 digits).');
                    return;
                }
            } else {
                // Use owner number from config
                if (!config.PAIRING_NUMBER) {
                    await reply('❌ No phone number provided and PAIRING_NUMBER not configured.');
                    return;
                }
                phoneNumber = config.PAIRING_NUMBER;
            }
            
            await reply('🔄 Generating pairing code...');
            
            // Generate pairing code
            const code = await sock.requestPairingCode(phoneNumber);
            
            const pairingMessage = `🔗 *WhatsApp Pairing Code*\n\n` +
                                 `📱 Phone Number: +${phoneNumber}\n` +
                                 `🔢 Pairing Code: *${code}*\n\n` +
                                 `📋 *Instructions:*\n` +
                                 `1. Open WhatsApp on your phone\n` +
                                 `2. Go to Settings > Linked Devices\n` +
                                 `3. Tap "Link a Device"\n` +
                                 `4. Select "Link with phone number instead"\n` +
                                 `5. Enter the code: *${code}*\n\n` +
                                 `⚠️ *Note:* This code will expire in a few minutes.\n` +
                                 `⏰ Generated at: ${new Date().toLocaleString()}`;
            
            await reply(pairingMessage);
            
            // Log the pairing attempt
            console.log(`🔗 Pairing code generated for ${phoneNumber}: ${code}`);
            
        } catch (error) {
            console.error('Pairing code generation error:', error);
            
            let errorMessage = '❌ Failed to generate pairing code.';
            
            if (error.message?.includes('not-authorized')) {
                errorMessage += '\n\n💡 Make sure the bot is properly logged out before requesting a new pairing code.';
            } else if (error.message?.includes('rate-limit')) {
                errorMessage += '\n\n⏳ Rate limited. Please wait a few minutes before requesting another code.';
            } else if (error.message?.includes('invalid')) {
                errorMessage += '\n\n📱 Please check the phone number format and try again.';
            }
            
            await reply(errorMessage);
        }
    }
};
