#!/usr/bin/env node
import 'dotenv/config';
import { logger } from './logger.js';
import { config } from '../config/config.js';
import { testSession, validateSessionString, getSessionInfo } from './sessionManager.js';

/**
 * Standalone session testing utility
 */

async function runSessionTest() {
    console.log('');
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║            SESSION TESTER v2.0           ║');
    console.log('╚═══════════════════════════════════════════╝');
    console.log('');
    
    try {
        const sessionString = config.SESSION_STRING;
        
        if (!sessionString || sessionString === 'your-session-string-here') {
            console.log('❌ No session string found in environment variables');
            console.log('');
            console.log('🔧 Setup Instructions:');
            console.log('1. Copy .env.example to .env');
            console.log('2. Set SESSION_STRING=your-mega-session-string');
            console.log('3. Run this test again');
            console.log('');
            console.log('📝 Session string format: prefix~megaFileId#decryptionKey');
            console.log('Example: MyBot~abc123def456#xyz789uvw123');
            process.exit(1);
        }
        
        console.log('🔍 Session Information:');
        console.log(`   Length: ${sessionString.length} characters`);
        console.log(`   Preview: ${sessionString.substring(0, 30)}...`);
        console.log('');
        
        // Step 1: Basic format validation
        console.log('📋 Step 1: Format Validation');
        console.log('─'.repeat(40));
        
        const validation = validateSessionString(sessionString);
        
        if (validation.valid) {
            console.log(`✅ Format: Valid (${validation.type})`);
            if (validation.type === 'mega') {
                console.log(`📂 Prefix: ${validation.prefix}`);
            }
        } else {
            console.log(`❌ Format: Invalid - ${validation.error}`);
            process.exit(1);
        }
        
        console.log('');
        
        // Step 2: Session info extraction
        console.log('📊 Step 2: Session Information');
        console.log('─'.repeat(40));
        
        const sessionInfo = getSessionInfo(sessionString);
        
        console.log(`📝 Type: ${sessionInfo.type}`);
        console.log(`🏷️  Source: ${sessionInfo.source || 'Unknown'}`);
        console.log(`📱 Phone: ${sessionInfo.phoneNumber || 'Unknown'}`);
        console.log(`📋 Description: ${sessionInfo.description || 'N/A'}`);
        console.log('');
        
        // Step 3: Connectivity test
        console.log('🧪 Step 3: Connectivity Test');
        console.log('─'.repeat(40));
        
        if (validation.type === 'mega') {
            console.log('🔗 Testing Mega.nz connection...');
            console.log('⏳ This may take up to 30 seconds...');
            console.log('');
        }
        
        const testResult = await testSession(sessionString);
        
        if (testResult.success) {
            console.log('✅ Connection Test: PASSED');
            console.log('');
            console.log('📊 Session Details:');
            console.log(`   📱 Phone Number: ${testResult.phoneNumber}`);
            console.log(`   ✅ Registered: ${testResult.registered ? 'Yes' : 'No'}`);
            console.log(`   🔑 Keys Available: ${testResult.hasKeys ? 'Yes' : 'No'}`);
            console.log(`   📋 Credentials: ${testResult.hasCredentials ? 'Valid' : 'Missing'}`);
            console.log(`   🔢 Key Count: ${testResult.keyCount || 0}`);
            
            if (testResult.registrationId) {
                console.log(`   🆔 Registration ID: ${testResult.registrationId}`);
            }
            
            console.log('');
            console.log('🎉 SUCCESS: Your session is working perfectly!');
            console.log('✅ The bot should connect without any issues.');
            
        } else {
            console.log('❌ Connection Test: FAILED');
            console.log('');
            console.log('🐛 Error Details:');
            console.log(`   Type: ${testResult.type}`);
            console.log(`   Message: ${testResult.error}`);
            console.log('');
            
            // Provide specific troubleshooting advice
            if (testResult.type === 'validation') {
                console.log('🔧 Troubleshooting - Format Issues:');
                console.log('• Check your session string format');
                console.log('• Ensure proper Mega.nz format: prefix~fileId#key');
                console.log('• Remove any extra spaces or quotes');
            } else if (testResult.type === 'processing') {
                if (testResult.error.includes('network') || testResult.error.includes('timeout')) {
                    console.log('🌐 Troubleshooting - Network Issues:');
                    console.log('• Check your internet connection');
                    console.log('• Try again in a few minutes');
                    console.log('• Verify Mega.nz is accessible');
                } else if (testResult.error.includes('not found') || testResult.error.includes('404')) {
                    console.log('📁 Troubleshooting - File Issues:');
                    console.log('• The Mega.nz file may have been deleted');
                    console.log('• Generate a new session string');
                    console.log('• Check the file ID and key are correct');
                } else {
                    console.log('🔧 General Troubleshooting:');
                    console.log('• Generate a new session string');
                    console.log('• Ensure your session generator is working');
                    console.log('• Contact your session provider for support');
                }
            }
            
            console.log('');
            process.exit(1);
        }
        
    } catch (error) {
        console.log('💥 Unexpected Error:');
        console.log(`   ${error.message}`);
        console.log('');
        console.log('🔧 Please check:');
        console.log('• Your .env file configuration');
        console.log('• Internet connection');
        console.log('• Session string format');
        
        process.exit(1);
    }
    
    console.log('');
    console.log('🚀 Ready to start your bot!');
    console.log('Run: npm start');
    console.log('');
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n\n👋 Test interrupted by user');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n👋 Test terminated');
    process.exit(0);
});

// Run the test
runSessionTest().catch((error) => {
    logger.error('Fatal error in session test:', error);
    process.exit(1);
});
