#!/usr/bin/env node
// Enhanced Mega.nz Session Debugger
import { File } from 'megajs';
import { BufferJSON } from '@whiskeysockets/baileys';

async function debugMegaSession() {
    // Your session string
    const sessionString = "Groq~X6Rk1Yzb#CkAAaCdiYus3e6FjImyY92rBfv8-hKpHXeIOKch6Ncg";
    
    console.log('🔍 Enhanced Mega.nz Session Debugger');
    console.log('=====================================\n');
    
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
    console.log(`🔗 Mega URL: ${megaUrl}\n`);
    
    try {
        console.log('⏳ Step 1: Downloading from Mega.nz...');
        
        // Create file instance and download
        const file = File.fromURL(megaUrl);
        const buffer = await file.downloadBuffer();
        console.log(`✅ Downloaded ${buffer.length} bytes\n`);
        
        // Convert to string and examine raw content
        const rawContent = buffer.toString('utf-8');
        console.log('📄 Step 2: Raw Content Analysis');
        console.log(`   Content length: ${rawContent.length} characters`);
        console.log(`   First 200 characters: ${rawContent.substring(0, 200)}`);
        console.log(`   Last 100 characters: ${rawContent.substring(rawContent.length - 100)}\n`);
        
        // Try to parse as JSON
        let jsonData;
        console.log('🔍 Step 3: JSON Parsing...');
        try {
            jsonData = JSON.parse(rawContent);
            console.log('✅ Successfully parsed as JSON');
        } catch (parseError) {
            console.error('❌ JSON parsing failed:', parseError.message);
            
            // Try with BufferJSON reviver
            try {
                console.log('🔄 Trying with BufferJSON reviver...');
                jsonData = JSON.parse(rawContent, BufferJSON.reviver);
                console.log('✅ Successfully parsed with BufferJSON reviver');
            } catch (reviverError) {
                console.error('❌ BufferJSON parsing also failed:', reviverError.message);
                console.log('\n📋 Raw content (first 1000 chars):');
                console.log(rawContent.substring(0, 1000));
                return;
            }
        }
        
        // Analyze the JSON structure
        console.log('\n📊 Step 4: JSON Structure Analysis');
        console.log(`   Type: ${typeof jsonData}`);
        console.log(`   Is Array: ${Array.isArray(jsonData)}`);
        console.log(`   Top-level keys: ${Object.keys(jsonData).join(', ')}`);
        
        // Deep structure analysis
        console.log('\n🔍 Step 5: Deep Structure Analysis');
        
        if (jsonData.creds) {
            console.log('✅ Found creds object');
            console.log(`   Creds type: ${typeof jsonData.creds}`);
            console.log(`   Creds keys: ${Object.keys(jsonData.creds).join(', ')}`);
            
            // Check for essential WhatsApp fields
            const essentialFields = [
                'noiseKey', 'signedIdentityKey', 'signedPreKey', 
                'registrationId', 'advSecretKey', 'nextPreKeyId',
                'firstUnuploadedPreKeyId', 'serverHasPreKeys'
            ];
            
            console.log('\n   🔑 Essential WhatsApp Fields Check:');
            essentialFields.forEach(field => {
                const exists = jsonData.creds[field] !== undefined;
                console.log(`      ${field}: ${exists ? '✅' : '❌'}`);
                if (exists && field === 'registrationId') {
                    console.log(`         Value: ${jsonData.creds[field]}`);
                }
            });
            
            // Check registration status
            if (jsonData.creds.registered !== undefined) {
                console.log(`   📱 Registration Status: ${jsonData.creds.registered}`);
            }
            
            // Check phone number
            if (jsonData.creds.me && jsonData.creds.me.id) {
                const phoneNumber = jsonData.creds.me.id.split(':')[0];
                console.log(`   📞 Phone Number: ${phoneNumber}`);
            }
            
        } else {
            console.log('❌ No creds object found');
            
            // Check if essential fields exist at root level
            const rootFields = Object.keys(jsonData);
            const essentialFields = ['noiseKey', 'signedIdentityKey', 'registrationId'];
            const foundEssentials = essentialFields.filter(field => rootFields.includes(field));
            
            console.log(`   📋 Root level keys: ${rootFields.join(', ')}`);
            console.log(`   🔑 Essential fields at root: ${foundEssentials.join(', ')}`);
            
            if (foundEssentials.length > 0) {
                console.log('\n💡 SOLUTION FOUND:');
                console.log('   Your session data is in FLAT format (essential fields at root level)');
                console.log('   The bot expects NESTED format (fields inside creds object)');
                console.log('\n🔧 Applying conversion...');
                
                // Convert flat to nested
                const convertedData = {
                    creds: jsonData,
                    keys: {}
                };
                
                console.log('✅ Conversion successful!');
                console.log(`   New structure: creds (${Object.keys(convertedData.creds).length} fields), keys (${Object.keys(convertedData.keys).length} fields)`);
                
                // Test the converted structure
                console.log('\n🧪 Testing converted structure...');
                const requiredFields = ['noiseKey', 'signedIdentityKey', 'registrationId'];
                const missingFields = requiredFields.filter(field => !convertedData.creds[field]);
                
                if (missingFields.length === 0) {
                    console.log('✅ Converted structure has all required fields!');
                    console.log('✅ Your session should work after this fix');
                } else {
                    console.log(`❌ Still missing fields: ${missingFields.join(', ')}`);
                }
                
                return;
            }
        }
        
        if (jsonData.keys) {
            console.log('✅ Found keys object');
            console.log(`   Keys type: ${typeof jsonData.keys}`);
            console.log(`   Keys count: ${Object.keys(jsonData.keys).length}`);
            
            // Sample some key types
            const keyTypes = {};
            Object.keys(jsonData.keys).forEach(key => {
                const keyType = key.split('-')[0] || 'unknown';
                keyTypes[keyType] = (keyTypes[keyType] || 0) + 1;
            });
            
            console.log(`   Key types: ${JSON.stringify(keyTypes, null, 2)}`);
        } else {
            console.log('⚠️ No keys object (will be initialized as empty)');
        }
        
        // Final assessment
        console.log('\n🎯 Step 6: Final Assessment');
        
        const hasValidCreds = jsonData.creds && 
                             jsonData.creds.noiseKey && 
                             jsonData.creds.signedIdentityKey && 
                             jsonData.creds.registrationId;
        
        const hasEssentialAtRoot = jsonData.noiseKey && 
                                  jsonData.signedIdentityKey && 
                                  jsonData.registrationId;
        
        if (hasValidCreds) {
            console.log('✅ Valid nested session structure detected');
            console.log('✅ Should work with current bot code');
        } else if (hasEssentialAtRoot) {
            console.log('✅ Valid flat session structure detected');
            console.log('🔧 Needs conversion to nested format (bot will handle this)');
            console.log('✅ Should work after automatic conversion');
        } else {
            console.log('❌ Invalid session structure');
            console.log('💡 This file may not be a valid WhatsApp session');
            
            console.log('\n🔧 Recommended actions:');
            console.log('1. Check if you downloaded the correct file');
            console.log('2. Verify your session generator created the right format');
            console.log('3. Try generating a new session');
            console.log('4. Make sure you\'re using a recent session (not old backups)');
        }
        
        console.log('\n📋 Summary:');
        console.log(`   File size: ${buffer.length} bytes`);
        console.log(`   JSON valid: ${jsonData ? '✅' : '❌'}`);
        console.log(`   Has creds: ${jsonData && jsonData.creds ? '✅' : '❌'}`);
        console.log(`   Has keys: ${jsonData && jsonData.keys ? '✅' : '❌'}`);
        console.log(`   Structure: ${hasValidCreds ? 'Nested' : hasEssentialAtRoot ? 'Flat' : 'Invalid'}`);
        
    } catch (error) {
        console.error('\n❌ Debug failed:', error.message);
        console.error('Stack trace:', error.stack);
        
        if (error.message.includes('ENOTFOUND')) {
            console.error('💡 Network issue - check internet connection');
        } else if (error.message.includes('404')) {
            console.error('💡 File not found - the Mega.nz file may have been deleted');
            console.error(`   Try visiting: ${megaUrl}`);
        } else if (error.message.includes('403')) {
            console.error('💡 Access denied - check file permissions or decryption key');
        }
    }
}

// Run the debugger
debugMegaSession().catch(console.error);
