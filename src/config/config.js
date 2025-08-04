export const config = {
    // Bot Configuration
    BOT_NAME: process.env.BOT_NAME || 'Groq 🤖',
    PREFIX: process.env.PREFIX || '!',
    OWNER_NUMBER: process.env.OWNER_NUMBER || '2348166353338',
    TIMEZONE: process.env.TIMEZONE || 'Africa/Lagos',
    
    // Authentication Method
    USE_PAIRING_CODE: process.env.USE_PAIRING_CODE !== 'false',
    SEND_STARTUP_MESSAGE: process.env.SEND_STARTUP_MESSAGE !== 'false',
    AUTO_RESTART_ON_LOGOUT: process.env.AUTO_RESTART_ON_LOGOUT === 'true',
    
    // Webhook for notifications (optional)
    WEBHOOK_URL: process.env.WEBHOOK_URL || '',
    
    // API Keys
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY || '',
    QUOTE_API_KEY: process.env.QUOTE_API_KEY || '',
    
    // PostgreSQL Database Configuration
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/groq_bot',
    DATABASE_NAME: process.env.DATABASE_NAME || 'groq_bot',
    
    // Individual PostgreSQL connection parameters (fallback)
    PG_HOST: process.env.PG_HOST || 'localhost',
    PG_PORT: parseInt(process.env.PG_PORT) || 5432,
    PG_USER: process.env.PG_USER || 'postgres',
    PG_PASSWORD: process.env.PG_PASSWORD || '',
    PG_DATABASE: process.env.PG_DATABASE || 'groq_bot',
    PG_SSL: process.env.PG_SSL === 'true',
    
    // Database Connection Settings
    MAX_DB_CONNECTIONS: parseInt(process.env.MAX_DB_CONNECTIONS) || 20,
    DB_IDLE_TIMEOUT: parseInt(process.env.DB_IDLE_TIMEOUT) || 10000,
    
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
    ENABLE_GROUP_EVENTS: process.env.ENABLE_GROUP_EVENTS !== 'false',
    
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
            const cleanNumber = this.OWNER_NUMBER.replace(/\D/g, '');
            if (cleanNumber.length < 10 || cleanNumber.length > 15) {
                required.push('OWNER_NUMBER (invalid format - should be 10-15 digits)');
            }
        }
        
        // PostgreSQL validation
        if (!this.DATABASE_URL && (!this.PG_HOST || !this.PG_USER || !this.PG_DATABASE)) {
            required.push('DATABASE_URL or complete PostgreSQL credentials (PG_HOST, PG_USER, PG_DATABASE)');
        }
        
        // Validate DATABASE_URL format if provided
        if (this.DATABASE_URL) {
            try {
                const url = new URL(this.DATABASE_URL);
                if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
                    required.push('DATABASE_URL must use postgresql:// or postgres:// protocol');
                }
            } catch (error) {
                required.push('DATABASE_URL is not a valid URL format');
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
            if (this.DATABASE_URL && this.DATABASE_URL.includes('localhost')) {
                warnings.push('Using localhost database in production - consider using cloud PostgreSQL');
            }
            if (!this.PG_PASSWORD && this.DATABASE_URL && !this.DATABASE_URL.includes('password')) {
                warnings.push('No database password detected - ensure your database is properly secured');
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
