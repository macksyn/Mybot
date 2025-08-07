#!/usr/bin/env node
// scripts/testSession.js
import 'dotenv/config';
import { testSession, validateSessionString, getSessionInfo } from '../src/utils/sessionManager.js';
import { config } from '../src/config/config.js';

async function runSessionTest() {
    console.log('🔍 Session Testing Tool\n');
    
    const sessionString = config.SESSION_STRING;
    
    if (!sessionString || sessionString === 'your-session-string-here') {
        console.error('❌ SESSION_STRING not found in .env file');
        console.error('💡 Please set SESSION_STRING in your .env file');
        process.exit(1);
    }
    
    console.log(`📝 Session String: ${sessionString.substring(0, 30)}...`);
    console.log(`🆔 Session ID: ${config.SESSION_ID}\n`);
    
    // Step 1: Basic validation
    console.log('🔸 Step 1: Basic Validation');
    const validation = validateSessionString(sessionString);
    
    if (validation.valid) {
        console.log(`✅ Format: Valid (Type: ${validation.type})`);
        if (validation.prefix) {
            console.log(`   Prefix: ${validation.prefix}`);
        }
        
        // Show what was detected
        if (validation.type === 'mega') {
            const parts = sessionString.split('~');
            if (parts.length === 2) {
                const megaParts = parts[1].split('#');
                console.log(`   File ID: ${megaParts[0]}`);
                console.log(`   Key: ${megaParts[1].substring(0, 20)}...`);
            }
        }
    } else {
        console.log(`❌ Format: Invalid - ${validation.error}`);
        
        // Provide specific guidance
        console.log('\n💡 Session String Format Guide:');
        console.log('   • Mega.nz format: prefix~fileId#decryptionKey');
        console.log('   • Example: Groq~abc123#xyz789def456...');
        console.log('   • Direct format: prefix~base64data');
        console.log('   • Raw JSON: {"creds":...}');
        
        process.exit(1);
    }
    
    // Step 2: Extract session info
    console.log('\n🔸 Step 2: Session Information');
    try {
        const info = await getSessionInfo(sessionString);
        console.log(`   Type: ${info.type}`);
        console.log(`   Has Credentials: ${info.hasCredentials ? '✅' : '❌'}`);
        console.log(`   Has Keys: ${info.hasKeys ? '✅' : '❌'}`);
        console.log(`   Phone Number: ${info.phoneNumber}`);
        console.log(`   Registered: ${info.registered}`);
    } catch (error) {
        console.log(`   ❌ Error getting session info: ${error.message}`);
    }
    
    // Step 3: Connectivity test
    console.log('\n🔸 Step 3: Connectivity Test');
    
    if (validation.type === 'mega') {
        console.log('🔗 Testing Mega.nz download...');
        console.log('⏳ This may take a moment...');
    } else {
        console.log('📝 Testing direct session parsing...');
    }
    
    try {
        const testResult = await testSession(sessionString);
        
        if (testResult.success) {
            console.log('✅ Session test successful!');
            console.log(`   Type: ${testResult.type}`);
            console.log(`   Has Credentials: ${testResult.hasCredentials ? '✅' : '❌'}`);
            console.log(`   Phone Number: ${testResult.phoneNumber || 'Unknown'}`);
        } else {
            console.log('❌ Session test failed:');
            console.log(`   Error: ${testResult.error}`);
            
            // Provide helpful tips
            if (testResult.error.includes('network') || testResult.error.includes('ENOTFOUND')) {
                console.log('\n💡 Network Tips:');
                console.log('   • Check your internet connection');
                console.log('   • Try again in a few moments');
                console.log('   • Check if Mega.nz is accessible');
            } else if (testResult.error.includes('not found') || testResult.error.includes('404')) {
                console.log('\n💡 File Tips:');
                console.log('   • The Mega.nz file may have been deleted');
                console.log('   • Generate a new session using your session generator');
                console.log('   • Check if the file ID and key are correct');
            } else if (testResult.error.includes('JSON') || testResult.error.includes('credentials')) {
                console.log('\n💡 Format Tips:');
                console.log('   • The downloaded file may not be valid session data');
                console.log('   • Try generating a new session');
                console.log('   • Check your session generator output format');
            } else if (testResult.error.includes('Unexpected token')) {
                console.log('\n💡 Parsing Tips:');
                console.log('   • Session string format may be incorrect');
                console.log('   • Verify you copied the complete session string');
                console.log('   • Make sure it follows: prefix~fileId#key format');
                console.log('   • Or for direct: prefix~base64data');
            }
            
            process.exit(1);
        }
    } catch (error) {
        console.log('❌ Unexpected error during testing:');
        console.log(`   ${error.message}`);
        
        // Debug information
        console.log('\n🔧 Debug Information:');
        console.log(`   Session string length: ${sessionString.length}`);
        console.log(`   Contains ~: ${sessionString.includes('~')}`);
        console.log(`   Contains #: ${sessionString.includes('#')}`);
        
        if (sessionString.includes('~')) {
            const parts = sessionString.split('~');
            console.log(`   Parts after split: ${parts.length}`);
            if (parts.length === 2) {
                console.log(`   Second part contains #: ${parts[1].includes('#')}`);
                if (parts[1].includes('#')) {
                    const subParts = parts[1].split('#');
                    console.log(`   Mega parts: ${subParts.length}`);
                }
            }
        }
        
        process.exit(1);
    }
    
    // Step 4: Configuration check
    console.log('\n🔸 Step 4: Configuration Check');
    console.log(`   Bot Name: ${config.BOT_NAME}`);
    console.log(`   Prefix: ${config.PREFIX}`);
    console.log(`   Owner: ${config.OWNER_NUMBER}`);
    console.log(`   Environment: ${config.NODE_ENV}`);
    console.log(`   Persist Sessions: ${config.PERSIST_SESSIONS ? '✅' : '❌'}`);
    
    // Final summary
    console.log('\n🎉 Session Validation Complete!');
    console.log('✅ Your session is ready to use');
    console.log('🚀 You can now start your bot with: npm start');
    
    if (validation.type === 'mega') {
        console.log('\n📋 Mega.nz Session Tips:');
        console.log('   • Sessions are cached locally for faster access');
        console.log('   • Cache expires after 1 hour for security');
        console.log('   • Keep your session generator link secure');
        console.log('   • If the bot fails to start, run this test again');
        console.log('\n🔄 Next time you start the bot:');
        console.log('   • First start may be slow (downloads from Mega)');
        console.log('   • Subsequent starts will be faster (uses cache)');
    }
}

// Run the test
runSessionTest().catch(error => {
    console.error('\n💥 Fatal error:', error.message);
    console.error('\n🔧 Common Issues:');
    console.error('   • Invalid session string format');
    console.error('   • Network connection problems');
    console.error('   • Expired or deleted Mega.nz file');
    console.error('   • Corrupted session data');
    console.error('\n💡 Try generating a fresh session string');
    process.exit(1);
});
