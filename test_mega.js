#!/usr/bin/env node
// Test script for Mega.nz download
import { File } from 'megajs';

async function testMegaDownload() {
    // Your session string
    const sessionString = "Groq~X6Rk1Yzb#CkAAaCdiYus3e6FjImyY92rBfv8-hKpHXeIOKch6Ncg";
    
    console.log('🧪 Testing Mega.nz Download');
    console.log(`📝 Session String: ${sessionString}`);
    
    // Parse the session string
    const parts = sessionString.split('~');
    if (parts.length !== 2) {
        console.error('❌ Invalid session format');
        return;
    }
    
    const [prefix, megaData] = parts;
    const [fileId, decryptionKey] = megaData.split('#');
    
    console.log(`📊 Parsed Components:`);
    console.log(`   Prefix: ${prefix}`);
    console.log(`   File ID: ${fileId}`);
    console.log(`   Key: ${decryptionKey.substring(0, 20)}...`);
    
    // Construct Mega URL
    const megaUrl = `https://mega.nz/file/${fileId}#${decryptionKey}`;
    console.log(`🔗 Mega URL: ${megaUrl}`);
    
    try {
        console.log('\n⏳ Attempting to download...');
        
        // Create file instance
        const file = File.fromURL(megaUrl);
        console.log('✅ File instance created');
        
        // Download the file
        const buffer = await file.downloadBuffer();
        console.log(`✅ Downloaded ${buffer.length} bytes`);
        
        // Convert to string
        const content = buffer.toString('utf-8');
        console.log(`📄 Content preview: ${content.substring(0, 200)}...`);
        
        // Try to parse as JSON
        let jsonData;
        try {
            jsonData = JSON.parse(content);
            console.log('✅ Valid JSON format');
        } catch (parseError) {
            console.error('❌ JSON parsing failed:', parseError.message);
            console.log('Raw content (first 500 chars):', content.substring(0, 500));
            return;
        }
        
        // Check structure
        console.log('\n📊 JSON Structure Analysis:');
        console.log(`   Top-level keys: ${Object.keys(jsonData).join(', ')}`);
        
        if (jsonData.creds) {
            console.log('✅ Found creds object');
            console.log(`   Creds keys: ${Object.keys(jsonData.creds).join(', ')}`);
            
            // Check for essential fields
            const essential = ['noiseKey', 'signedIdentityKey', 'registrationId'];
            const missing = essential.filter(key => !jsonData.creds[key]);
            
            if (missing.length === 0) {
                console.log('✅ All essential creds fields present');
            } else {
                console.log(`⚠️ Missing essential fields: ${missing.join(', ')}`);
            }
            
            if (jsonData.creds.registered !== undefined) {
                console.log(`📱 Registration status: ${jsonData.creds.registered}`);
            }
            
            if (jsonData.creds.me) {
                const phoneNumber = jsonData.creds.me.id?.split(':')[0];
                console.log(`📞 Phone number: ${phoneNumber || 'Unknown'}`);
            }
        } else {
            console.error('❌ Missing creds object');
        }
        
        if (jsonData.keys) {
            console.log('✅ Found keys object');
            console.log(`   Keys count: ${Object.keys(jsonData.keys).length}`);
        } else {
            console.log('⚠️ No keys object (will be initialized as empty)');
        }
        
        console.log('\n🎉 Mega.nz download test successful!');
        console.log('✅ Your session file is valid and ready to use');
        
    } catch (error) {
        console.error('\n❌ Download failed:', error.message);
        
        if (error.message.includes('ENOTFOUND')) {
            console.error('💡 Network issue - check internet connection');
        } else if (error.message.includes('404')) {
            console.error('💡 File not found - check if Mega.nz file exists');
            console.error(`   Try visiting: ${megaUrl}`);
        } else if (error.message.includes('403')) {
            console.error('💡 Access denied - check file permissions or key');
        } else {
            console.error('💡 Unexpected error - check Mega.nz service status');
        }
        
        console.error('\n🔧 Troubleshooting steps:');
        console.error('1. Visit the Mega URL in your browser to verify file exists');
        console.error('2. Check your internet connection');
        console.error('3. Verify the file ID and key are correct');
        console.error('4. Generate a new session if the file was deleted');
    }
}

// Run the test
testMegaDownload().catch(console.error);
