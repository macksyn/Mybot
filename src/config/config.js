export const config = {
    // Bot Configuration
    BOT_NAME: process.env.BOT_NAME || 'WhatsApp Bot',
    PREFIX: process.env.PREFIX || '!',
    OWNER_NUMBER: process.env.OWNER_NUMBER || '',
    TIMEZONE: process.env.TIMEZONE || 'UTC',
    
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
        
        if (!this.BOT_NAME) required.push('BOT_NAME');
        if (!this.PREFIX) required.push('PREFIX');
        
        if (required.length > 0) {
            throw new Error(`Missing required configuration: ${required.join(', ')}`);
        }
        
        // Validate admin numbers format
        if (this.ADMIN_NUMBERS.length > 0) {
            this.ADMIN_NUMBERS = this.ADMIN_NUMBERS.map(num => num.trim()).filter(num => num);
        }
        
        return true;
    }
};

// Validate configuration on load
config.validate();
