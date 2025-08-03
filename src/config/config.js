export const config = {
    // Bot Configuration
    BOT_NAME: process.env.BOT_NAME || 'WhatsApp Bot',
    PREFIX: process.env.PREFIX || '!',
    OWNER_NUMBER: process.env.OWNER_NUMBER || '',
    TIMEZONE: process.env.TIMEZONE || 'UTC',
    
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
    ADMIN_NUMBERS: process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [],
    
    // Features Toggle
    ENABLE_WEATHER: process.env.ENABLE_WEATHER === 'true',
    ENABLE_JOKES: process.env.ENABLE_JOKES === 'true',
    ENABLE_QUOTES: process.env.ENABLE_QUOTES === 'true',
    ENABLE_CALCULATOR: process.env.ENABLE_CALCULATOR === 'true',
    ENABLE_ADMIN_COMMANDS: process.env.ENABLE_ADMIN_COMMANDS === 'true',
    
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_TO_FILE: process.env.LOG_TO_FILE === 'true',
    
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
            const cleanNumber = this.OWNER_NUMBER.replace(/\D/g, '');
            if (cleanNumber.length < 10 || cleanNumber.length > 15) {
                required.push('OWNER_NUMBER (invalid format - should be 10-15 digits)');
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
        
        // Validate and clean admin numbers
        if (this.ADMIN_NUMBERS.length > 0) {
            this.ADMIN_NUMBERS = this.ADMIN_NUMBERS
                .map(num => num.trim().replace(/\D/g, ''))
                .filter(num => num && num.length >= 10);
        }
        
        return true;
    }
};

// Validate configuration on load
config.validate();