import { validateSessionString, normalizeSessionString, getSessionInfo } from '../utils/sessionManager.js';

export const config = {
    // Bot Configuration
    BOT_NAME: process.env.BOT_NAME || 'Groq 🤖',
    PREFIX: process.env.PREFIX || '.',
    TIMEZONE: process.env.TIMEZONE || 'Africa/Lagos',
    
    // Session Configuration - PRIMARY authentication method
    SESSION_STRING: normalizeSessionString(process.env.SESSION_STRING || 'your-session-string-here'),
    SESSION_ID: process.env.SESSION_ID || 'whatsapp-bot-main',
    
    // Startup Configuration
    SEND_STARTUP_MESSAGE: process.env.SEND_STARTUP_MESSAGE !== 'false',
    AUTO_RESTART_ON_LOGOUT: process.env.AUTO_RESTART_ON_LOGOUT === 'true',
    
    // Admin/Owner Configuration
    OWNER_NUMBER: process.env.OWNER_NUMBER || '',
    ADMIN_NUMBERS: process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [],
    
    // API Keys
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY || '',
    QUOTE_API_KEY: process.env.QUOTE_API_KEY || '',
    
    // Environment
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT) || 8000,
    
    // Security
    MAX_COMMANDS_PER_MINUTE: parseInt(process.env.MAX_COMMANDS_PER_MINUTE) || 10,
    
    // Features Toggle
    ENABLE_WEATHER: process.env.ENABLE_WEATHER === 'true',
    ENABLE_JOKES: process.env.ENABLE_JOKES === 'true',
    ENABLE_QUOTES: process.env.ENABLE_QUOTES === 'true',
    ENABLE_CALCULATOR: process.env.ENABLE_CALCULATOR === 'true',
    ENABLE_ADMIN_COMMANDS: process.env.ENABLE_ADMIN_COMMANDS === 'true',
    ENABLE_AUTO_REACT: process.env.ENABLE_AUTO_REACT === 'true',
    
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_TO_FILE: process.env.LOG_TO_FILE === 'true',
    
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
        
        // Handle different country codes
        if (cleaned.startsWith('234') && cleaned.length === 13) {
            // Nigerian number with country code
            return cleaned;
        } else if (cleaned.length === 10 && !cleaned.startsWith('234')) {
            // Nigerian number without country code
            return '234' + cleaned;
        } else if (cleaned.startsWith('1') && cleaned.length === 11) {
            // US/Canada number
            return cleaned;
        }
        
        return cleaned;
    },
    
    // Check if user is admin
    isAdmin(phoneNumber) {
        const normalized = this.normalizePhoneNumber(phoneNumber);
        return this.ADMIN_NUMBERS.some(admin => 
            this.normalizePhoneNumber(admin) === normalized
        );
    },
    
    // Check if user is owner
    isOwner(phoneNumber) {
        if (!this.OWNER_NUMBER) return false;
        const normalized = this.normalizePhoneNumber(phoneNumber);
        return this.normalizePhoneNumber(this.OWNER_NUMBER) === normalized;
    },
    
    // Validate required configuration
    validate() {
        const required = [];
        const warnings = [];
        
        // Basic validation
        if (!this.BOT_NAME) required.push('BOT_NAME');
        if (!this.PREFIX) required.push('PREFIX');
        if (!this.SESSION_ID) required.push('SESSION_ID');
        
        // Session ID format validation
        if (this.SESSION_ID) {
            const validSessionId = /^[a-zA-Z0-9_-]+$/.test(this.SESSION_ID);
            if (!validSessionId) {
                required.push('SESSION_ID (invalid format - use only letters, numbers, hyphens, and underscores)');
            }
        }
        
        // Session string validation
        if (this.isUsingSessionString()) {
            console.log('🔑 Validating session string authentication...');
            
            const validation = validateSessionString(this.SESSION_STRING);
            if (!validation.valid) {
                required.push(`SESSION_STRING (${validation.error})`);
            } else {
                console.log('✅ Session string format is valid');
                console.log(`📝 Session type: ${validation.type}`);
                
                if (validation.type === 'mega') {
                    console.log(`📂 Mega prefix: ${validation.prefix}`);
                }
            }
        } else {
            console.log('📁 File-based session authentication detected');
            warnings.push('Consider using SESSION_STRING for easier deployment');
        }
        
        // Production warnings
        if (this.NODE_ENV === 'production') {
            if (!this.OWNER_NUMBER) {
                warnings.push('OWNER_NUMBER not set - admin features will be limited');
            }
            if (this.SESSION_ID === 'whatsapp-bot-main') {
                warnings.push('Using default SESSION_ID - consider using a unique identifier');
            }
            if (!this.isUsingSessionString()) {
                warnings.push('Consider using SESSION_STRING for production deployment');
            }
        }
        
        // Throw error if required fields are missing
        if (required.length > 0) {
            throw new Error(`Missing required configuration: ${required.join(', ')}`);
        }
        
        // Show warnings
        if (warnings.length > 0) {
            console.warn('⚠️  Configuration warnings:');
            warnings.forEach(warning => console.warn(`   - ${warning}`));
            console.warn('');
        }
        
        // Normalize admin numbers
        if (this.ADMIN_NUMBERS.length > 0) {
            this.ADMIN_NUMBERS = this.ADMIN_NUMBERS
                .map(num => this.normalizePhoneNumber(num.trim()))
                .filter(num => num && num.length >= 10);
            
            console.log('✅ Admin numbers normalized:', this.ADMIN_NUMBERS);
        }
        
        // Normalize owner number
        if (this.OWNER_NUMBER) {
            this.OWNER_NUMBER = this.normalizePhoneNumber(this.OWNER_NUMBER);
            console.log('✅ Owner number normalized:', this.OWNER_NUMBER);
        }
        
        // Log configuration summary
        console.log('📊 Configuration Summary:');
        console.log(`   Bot Name: ${this.BOT_NAME}`);
        console.log(`   Prefix: ${this.PREFIX}`);
        console.log(`   Session ID: ${this.SESSION_ID}`);
        console.log(`   Auth Method: ${this.isUsingSessionString() ? 'Mega.nz Session' : 'File-based'}`);
        console.log(`   Environment: ${this.NODE_ENV}`);
        console.log(`   Features: Weather=${this.ENABLE_WEATHER}, Jokes=${this.ENABLE_JOKES}, Quotes=${this.ENABLE_QUOTES}`);
        console.log('');
        
        return true;
    }
};

// Validate configuration on load
try {
    config.validate();
} catch (error) {
    console.error('❌ Configuration Error:', error.message);
    console.error('');
    console.error('🔧 Setup Instructions:');
    console.error('');
    console.error('📝 Session String Setup (Recommended):');
    console.error('1. Get your session string from a session generator');
    console.error('2. Format should be: prefix~megaFileId#decryptionKey');
    console.error('3. Set SESSION_STRING in your .env file');
    console.error('4. Set SESSION_ID to a unique identifier');
    console.error('');
    console.error('Example SESSION_STRING:');
    console.error('MyBot~abc123def456ghi789#xyz123uvw456rst789');
    console.error('');
    console.error('💡 Run: npm run test:session to validate your session');
    console.error('');
    process.exit(1);
}
