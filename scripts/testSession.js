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
    } else {
        console.log(`❌ Format: Invalid - ${validation.error}`);
        process.exit(1);
    }
    
    // Step 2: Extract session info
    console.log('\n🔸 Step 2: Session Information');
    const info = getSessionInfo(sessionString);
    console.log(`   Type: ${info.type}`);
    console.log(`   Has Credentials: ${info.hasCredentials ? '✅' : '❌'}`);
    console.log(`   Has Keys: ${info.hasKeys ? '✅' : '❌'}`);
    console.log(`   Phone Number: ${info.phoneNumber}`);
    console.log(`   Registered: ${info.registered}`);
    
    // Step 3: Connectivity test
    console.log('\n🔸 Step 3: Connectivity Test');
    
    if (validation.type === 'mega') {
        console.log('🔗 Testing Mega.nz download...');
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
            }
            
            process.exit(1);
        }
    } catch (error) {
        console.log('❌ Unexpected error during testing:');
        console.log(`   ${error.message}`);
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
    }
}

// Run the test
runSessionTest().catch(error => {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
});
