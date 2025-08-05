export const config = {
    // Bot Configuration
    BOT_NAME: process.env.BOT_NAME || 'Groq 🤖',
    PREFIX: process.env.PREFIX || '!',
    OWNER_NUMBER: process.env.OWNER_NUMBER || '2348166353338',
    TIMEZONE: process.env.TIMEZONE || 'Africa/Lagos',
    
    // Authentication Method
    USE_PAIRING_CODE: process.env.USE_PAIRING_CODE === 'true',
    SEND_STARTUP_MESSAGE: process.env.SEND_STARTUP_MESSAGE !== 'false', // Default true
    AUTO_RESTART_ON_LOGOUT: process.env.AUTO_RESTART_ON_LOGOUT === 'true',
    
    // Webhook for notifications (optional)
    WEBHOOK_URL: process.env.WEBHOOK_URL || '',
    
    // API Keys
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY || '',
    QUOTE_API_KEY: process.env.QUOTE_API_KEY || '',
    
    // Database
    DATABASE_URL: process.env.DATABASE_URL || 'sqlite:./database.db',
    
    // Environment
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT) || 3000,
    
    // Session
    SESSION_ID: process.env.SESSION_ID || 'whatsapp-bot-session',
    
    // Security
    MAX_COMMANDS_PER_MINUTE: parseInt(process.env.MAX_COMMANDS_PER_MINUTE) || 10,
    ADMIN_NUMBERS: process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : ['2348166353338', '2348089782984'],
    
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
        
        // Pairing code validation
        if (this.USE_PAIRING_CODE && !this.OWNER_NUMBER) {
            required.push('OWNER_NUMBER (required when USE_PAIRING_CODE=true)');
        }
        
        if (this.USE_PAIRING_CODE && this.OWNER_NUMBER) {
            // Validate phone number format
            const cleanNumber = this.normalizePhoneNumber(this.OWNER_NUMBER);
            if (cleanNumber.length < 10 || cleanNumber.length > 15) {
                required.push('OWNER_NUMBER (invalid format - should be 10-15 digits)');
            } else {
                // Update the owner number to normalized format
                this.OWNER_NUMBER = cleanNumber;
            }
        }
        
        // Warnings for production
        if (this.NODE_ENV === 'production') {
            if (!this.OWNER_NUMBER) {
                warnings.push('OWNER_NUMBER not set - admin features will be limited');
            }
            if (!this.USE_PAIRING_CODE) {
                warnings.push('USE_PAIRING_CODE=false - QR code scanning required (not ideal for cloud deployment)');
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
        
        return true;
    }
};

// Validate configuration on load
config.validate();
