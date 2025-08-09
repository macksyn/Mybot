import winston from 'winston';
import fs from 'fs-extra';
import { config } from '../config/config.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom format with emojis and colors
const customFormat = printf(({ level, message, timestamp, stack, module, ...meta }) => {
    // Add module prefix if provided
    const modulePrefix = module ? `[${module}] ` : '';
    
    // Format the message
    let formattedMessage = '';
    
    if (stack) {
        formattedMessage = stack;
    } else if (typeof message === 'object' && message !== null) {
        try {
            // Handle special Baileys object formats
            if (message.msg && typeof message.msg === 'string') {
                formattedMessage = message.msg;
            } else if (message.message && typeof message.message === 'string') {
                formattedMessage = message.message;
            } else {
                formattedMessage = JSON.stringify(message, (key, value) => {
                    if (value && value.type === 'Buffer') {
                        return `[Buffer: ${value.data?.length || 0} bytes]`;
                    }
                    if (typeof value === 'object' && value !== null && value.constructor?.name !== 'Object') {
                        return `[${value.constructor.name}]`;
                    }
                    return value;
                }, 2);
            }
        } catch (error) {
            formattedMessage = String(message);
        }
    } else {
        formattedMessage = String(message || '');
    }
    
    // Clean up meta to avoid the weird character indexing issue
    const cleanMeta = {};
    Object.keys(meta).forEach(key => {
        const value = meta[key];
        // Skip numeric string keys (like "0", "1", "2", etc.) that cause the character indexing
        if (!key.match(/^\d+$/)) {
            cleanMeta[key] = value;
        }
    });
    
    // Add metadata if present
    const metaStr = Object.keys(cleanMeta).length > 0 ? ` ${JSON.stringify(cleanMeta)}` : '';
    
    return `${timestamp} ${level}: ${modulePrefix}${formattedMessage}${metaStr}`;
});

// Base transports
const transports = [
    new winston.transports.Console({
        format: combine(
            colorize({
                colors: {
                    error: 'red',
                    warn: 'yellow',
                    info: 'green',
                    debug: 'cyan',
                    verbose: 'magenta'
                }
            }),
            errors({ stack: true }),
            timestamp({ format: 'HH:mm:ss' }),
            customFormat
        )
    })
];

// Add file transports if enabled
if (config.LOG_TO_FILE) {
    // Ensure logs directory exists
    await fs.ensureDir('logs');
    
    // Error log
    transports.push(
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            format: combine(
                errors({ stack: true }),
                timestamp(),
                customFormat
            ),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    );
    
    // Combined log
    transports.push(
        new winston.transports.File({
            filename: 'logs/combined.log',
            format: combine(
                errors({ stack: true }),
                timestamp(),
                customFormat
            ),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    );
}

// Create logger instance
export const logger = winston.createLogger({
    level: config.LOG_LEVEL || 'info',
    format: combine(
        errors({ stack: true }),
        timestamp(),
        customFormat
    ),
    transports,
    exceptionHandlers: [
        new winston.transports.Console({
            format: combine(
                colorize(),
                errors({ stack: true }),
                timestamp({ format: 'HH:mm:ss' }),
                customFormat
            )
        })
    ],
    rejectionHandlers: [
        new winston.transports.Console({
            format: combine(
                colorize(),
                errors({ stack: true }),
                timestamp({ format: 'HH:mm:ss' }),
                customFormat
            )
        })
    ]
});

// Enhanced logging methods
logger.success = (message, ...args) => logger.info(`✅ ${message}`, ...args);
logger.error = (message, ...args) => logger.log('error', `❌ ${message}`, ...args);
logger.warn = (message, ...args) => logger.log('warn', `⚠️  ${message}`, ...args);
logger.debug = (message, ...args) => logger.log('debug', `🔍 ${message}`, ...args);
logger.trace = (message, ...args) => logger.log('debug', `🔬 ${message}`, ...args);

// Special handler for objects
logger.logObject = (level, message, obj) => {
    logger[level](`${message}:`, obj);
};

// Override the child method to work properly with Winston
logger.child = (options = {}) => {
    // Create a proper child logger that inherits configuration
    const childLogger = Object.create(logger);
    
    // Store the module/stream info
    const moduleInfo = options.module || options.stream || 'baileys';
    
    // Override logging methods to include module info
    const logLevels = ['error', 'warn', 'info', 'debug', 'verbose', 'trace'];
    
    logLevels.forEach(level => {
        childLogger[level] = (message, meta = {}) => {
            // Handle Baileys format: { level, msg, ...data }
            if (typeof message === 'object' && message !== null && message.level && message.msg) {
                const logLevel = message.level === 'trace' ? 'debug' : (message.level || 'info');
                return logger[logLevel](message.msg, { 
                    module: moduleInfo, 
                    ...message 
                });
            } 
            // Handle objects with message property
            else if (typeof message === 'object' && message !== null && message.message) {
                const logLevel = level === 'trace' ? 'debug' : level;
                return logger[logLevel](message.message, { 
                    module: moduleInfo, 
                    ...meta 
                });
            }
            // Handle regular objects
            else if (typeof message === 'object' && message !== null) {
                const logLevel = level === 'trace' ? 'debug' : level;
                try {
                    const messageStr = JSON.stringify(message);
                    return logger[logLevel](messageStr, { 
                        module: moduleInfo, 
                        ...meta 
                    });
                } catch (error) {
                    return logger[logLevel](String(message), { 
                        module: moduleInfo, 
                        ...meta 
                    });
                }
            } 
            // Handle regular messages
            else {
                const logLevel = level === 'trace' ? 'debug' : level;
                return logger[logLevel](String(message), { 
                    module: moduleInfo, 
                    ...meta 
                });
            }
        };
    });
    
    // Handle the log method specifically for Baileys
    childLogger.log = function(levelOrObject, message, meta = {}) {
        if (typeof levelOrObject === 'object' && levelOrObject !== null) {
            // Baileys format: log({ level, msg, ...data })
            const { level, msg, message: objMessage, ...data } = levelOrObject;
            const logLevel = level === 'trace' ? 'debug' : (level || 'info');
            const finalMessage = msg || objMessage || JSON.stringify(levelOrObject);
            
            return logger.log(logLevel, finalMessage, { 
                module: moduleInfo, 
                ...data 
            });
        } else {
            // Map trace to debug for Winston
            const logLevel = levelOrObject === 'trace' ? 'debug' : levelOrObject;
            
            // Handle object messages
            let finalMessage = message;
            if (typeof message === 'object' && message !== null) {
                try {
                    finalMessage = message.message || JSON.stringify(message);
                } catch (error) {
                    finalMessage = String(message);
                }
            }
            
            return logger.log(logLevel, String(finalMessage), { 
                module: moduleInfo, 
                ...meta 
            });
        }
    };
    
    return childLogger;
};

// Create child logger function - single implementation
export const createChildLogger = (moduleName) => {
    return logger.child({ module: moduleName });
};
