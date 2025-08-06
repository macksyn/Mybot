import { validateSessionString, normalizeSessionString, getSessionInfo } from '../utils/sessionManager.js';

export const config = {
    // Bot Configuration
    BOT_NAME: process.env.BOT_NAME || 'Groq 🤖',
    PREFIX: process.env.PREFIX || '!',
    TIMEZONE: process.env.TIMEZONE || 'Africa/Lagos',
    
    // Session Configuration - PRIMARY authentication method
    SESSION_STRING: normalizeSessionString(process.env.SESSION_STRING || 'your-session-string-here'),
    SESSION_ID: process.env.SESSION_ID || 'groq-bot-main',
    
    // Startup Configuration
    SEND_STARTUP_MESSAGE: process.env.SEND_STARTUP_MESSAGE !== 'false', // Default true
    AUTO_RESTART_ON_LOGOUT: process.env.AUTO_RESTART_ON_LOGOUT === 'true',
    
    // Admin/Owner Configuration
    OWNER_NUMBER: process.env.OWNER_NUMBER || '2348089782988',
    ADMIN_NUMBERS: process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : ['2348166353338', '2348089782988'],
    
    // API Keys
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY || '',
    QUOTE_API_KEY: process.env.QUOTE_API_KEY || '',
    
    // Database
    DATABASE_URL: process.env.DATABASE_URL || 'sqlite:./database.db',
    MONGODB_URI: process.env.MONGODB_URI || '',
    
    // Environment
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT) || 3000,
    
    // Security
    MAX_COMMANDS_PER_MINUTE: parseInt(process.env.MAX_COMMANDS_PER_MINUTE) || 10,
    
    // Features Toggle
    ENABLE_WEATHER: process.env.ENABLE_WEATHER === 'true',
    ENABLE_ECONOMY: process.env.ENABLE_ECONOMY === 'true',
    ENABLE_ATTENDANCE: process.env.ENABLE_ATTENDANCE === 'true',
    ENABLE_JOKES: process.env.ENABLE_JOKES === 'true',
    ENABLE_QUOTES: process.env.ENABLE_QUOTES === 'true',
    ENABLE_CALCULATOR: process.env.ENABLE_CALCULATOR === 'true',
    ENABLE_ADMIN_COMMANDS: process.env.ENABLE_ADMIN_COMMANDS === 'true',
    ENABLE_GROUP_EVENTS: process.env.ENABLE_GROUP_EVENTS === 'true',
    
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_TO_FILE: process.env.LOG_TO_FILE === 'true',
    
    // Session persistence
    PERSIST_SESSIONS: process.env.PERSIST_SESSIONS !== 'false', // Default true
    
    // Session directory structure (fallback for file-based sessions)
    getSessionPath() {
        return `./sessions/${this.SESSION_ID}`;
    },
    
    // Check if using session string
    isUsingSessionString() {
        return this.SESSION_STRING && this.SESSION_STRING !== 'your-session-string-here';
    },
    
    // Get session info
    getSessionInfo() {
        if (this.isUsingSessionString()) {
            try {
                return getSessionInfo(this.SESSION_STRING);
            } catch (error) {
                return { error: error.message };
            }
        }
        return { method: 'file-based' };
    },
    
    // Normalize phone numbers helper
    normalizePhoneNumber(number) {
        if (!number) return '';
        
        // Remove all non-digits
        let cleaned = number.replace(/\D/g, '');
        
        // Remove leading zeros
        cleaned = cleaned.replace(/^0+/, '');
        
        // Handle Nigerian numbers specifically
        if (cleaned.startsWith('234') && cleaned.length === 13) {
            return cleaned;
        } else if (cleaned.length === 10 && !cleaned.startsWith('234')) {
            return '234' + cleaned;
        }
        
        return cleaned;
    },
    
    // Validate required configuration
    validate() {
        const required = [];
        const warnings = [];
        
        if (!this.BOT_NAME) required.push('BOT_NAME');
        if (!this.PREFIX) required.push('PREFIX');
        
        // Session validation
        if (!this.SESSION_ID) {
            required.push('SESSION_ID (required for session identification)');
        } else {
            // Validate session ID format
            const validSessionId = /^[a-zA-Z0-9_-]+$/.test(this.SESSION_ID);
            if (!validSessionId) {
                required.push('SESSION_ID (invalid format - use only letters, numbers, hyphens, and underscores)');
            }
        }
        
        // Session string validation
        if (this.isUsingSessionString()) {
            console.log('🔑 Session string authentication detected');
            
            const validation = validateSessionString(this.SESSION_STRING);
            if (!validation.valid) {
                required.push(`SESSION_STRING (${validation.error})`);
            } else {
                console.log('✅ Session string validation passed');
                
                // Get session info
                const sessionInfo = this.getSessionInfo();
                if (sessionInfo.phoneNumber && sessionInfo.phoneNumber !== 'Unknown') {
                    console.log(`📱 Session phone number: ${sessionInfo.phoneNumber}`);
                }
                console.log(`📊 Session info: Registered=${sessionInfo.registered}, HasKeys=${sessionInfo.hasKeys}`);
            }
        } else {
            console.log('📁 File-based session authentication detected');
            
            // Check if session directory exists for file-based
            const fs = require('fs');
            const sessionPath = this.getSessionPath();
            
            if (!fs.existsSync(sessionPath)) {
                warnings.push(`Session directory does not exist: ${sessionPath}`);
            } else {
                // Check for essential session files
                const credsFile = `${sessionPath}/creds.json`;
                if (!fs.existsSync(credsFile)) {
                    warnings.push(`Session credentials not found: ${credsFile}`);
                    warnings.push('Make sure to copy your generated session files to the session directory');
                }
            }
        }
        
        // Warnings for production
        if (this.NODE_ENV === 'production') {
            if (!this.OWNER_NUMBER) {
                warnings.push('OWNER_NUMBER not set - admin features will be limited');
            }
            if (!this.isUsingSessionString() && !this.MONGODB_URI && this.PERSIST_SESSIONS) {
                warnings.push('MONGODB_URI not set - session backups will not work');
            }
            if (this.SESSION_ID === 'groq-bot-main') {
                warnings.push('Using default SESSION_ID - consider using a unique identifier');
            }
            if (!this.isUsingSessionString()) {
                warnings.push('Consider using SESSION_STRING for easier deployment');
            }
        }
        
        if (required.length > 0) {
            throw new Error(`Missing required configuration: ${required.join(', ')}`);
        }
        
        if (warnings.length > 0) {
            console.warn('⚠️  Configuration warnings:');
            warnings.forEach(warning => console.warn(`   - ${warning}`));
        }
        
        // Validate and normalize admin numbers
        if (this.ADMIN_NUMBERS.length > 0) {
            this.ADMIN_NUMBERS = this.ADMIN_NUMBERS
                .map(num => this.normalizePhoneNumber(num.trim()))
                .filter(num => num && num.length >= 10);
            
            console.log('✅ Normalized admin numbers:', this.ADMIN_NUMBERS);
        }
        
        // Normalize owner number
        if (this.OWNER_NUMBER) {
            this.OWNER_NUMBER = this.normalizePhoneNumber(this.OWNER_NUMBER);
            console.log('✅ Normalized owner number:', this.OWNER_NUMBER);
        }
        
        // Log session configuration
        console.log('📁 Session Configuration:');
        console.log(`   - Session ID: ${this.SESSION_ID}`);
        console.log(`   - Auth Method: ${this.isUsingSessionString() ? 'Session String' : 'File-based'}`);
        if (this.isUsingSessionString()) {
            console.log(`   - Session String Length: ${this.SESSION_STRING.length} characters`);
        } else {
            console.log(`   - Session Path: ${this.getSessionPath()}`);
        }
        console.log(`   - Persist Sessions: ${this.PERSIST_SESSIONS}`);
        
        return true;
    }
};

// Validate configuration on load
try {
    config.validate();
} catch (error) {
    console.error('❌ Configuration Error:', error.message);
    console.error('');
    console.error('🔧 Session Setup Instructions:');
    console.error('');
    console.error('📝 Method 1 - Session String (Recommended):');
    console.error('1. Use your session generator to get a session string');
    console.error('2. Copy the session string (like "malvin~3EB...")');
    console.error('3. Set SESSION_STRING=your-session-string in your .env file');
    console.error('4. Set SESSION_ID=unique-identifier in your .env file');
    console.error('');
    console.error('📁 Method 2 - Session Files (Alternative):');
    console.error('1. Generate session files using a session generator');
    console.error('2. Copy all session files to: ./sessions/[SESSION_ID]/');
    console.error('3. Ensure the session directory contains creds.json and other files');
    console.error('4. Leave SESSION_STRING empty or unset');
    console.error('');
    console.error('💡 Session String is recommended for easier deployment!');
    console.error('');
    process.exit(1);
}
