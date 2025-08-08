import winston from 'winston';
import fs from 'fs';
import { config } from '../config/config.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format with proper object serialization
const logFormat = printf(({ level, message, timestamp, stack, module, ...meta }) => {
    const modulePrefix = module ? `[${module}] ` : '';
    
    // Handle different message types
    let formattedMessage = '';
    
    if (stack) {
        // Error with stack trace
        formattedMessage = stack;
    } else if (typeof message === 'object' && message !== null) {
        // Object message - serialize it properly
        try {
            formattedMessage = JSON.stringify(message, (key, value) => {
                // Handle Buffer objects
                if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
                    return `[Buffer: ${value.data.length} bytes]`;
                }
                // Handle circular references
                if (typeof value === 'object' && value !== null && value.constructor) {
                    if (value.constructor.name === 'Object') return value;
                    return `[${value.constructor.name}]`;
                }
                return value;
            }, 2);
        } catch (err) {
            // Handle circular references or other JSON.stringify errors
            formattedMessage = `[Object: ${message.constructor?.name || 'Unknown'}] ${message.toString()}`;
        }
    } else {
        // String message
        formattedMessage = message || '';
    }
    
    // Add any additional metadata
    const metaString = Object.keys(meta).length > 0 ? 
        ` | Meta: ${JSON.stringify(meta)}` : '';
    
    return `${timestamp} ${level}: ${modulePrefix}${formattedMessage}${metaString}`;
});

// Create base transports
const transports = [
    // Console transport with colors
    new winston.transports.Console({
        format: combine(
            colorize(),
            errors({ stack: true }),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            logFormat
        )
    })
];

// Exception and rejection handlers
const exceptionHandlers = [
    new winston.transports.Console({
        format: combine(
            colorize(),
            errors({ stack: true }),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            logFormat
        )
    })
];

const rejectionHandlers = [
    new winston.transports.Console({
        format: combine(
            colorize(),
            errors({ stack: true }),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            logFormat
        )
    })
];

// Add file transports if enabled
if (config.LOG_TO_FILE) {
    // Ensure logs directory exists synchronously
    if (!fs.existsSync('logs')) {
        fs.mkdirSync('logs', { recursive: true });
    }
    
    // Add file transports
    transports.push(
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            format: combine(
                errors({ stack: true }),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                logFormat
            )
        }),
        new winston.transports.File({
            filename: 'logs/combined.log',
            format: combine(
                errors({ stack: true }),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                logFormat
            )
        })
    );

    // Add file handlers for exceptions and rejections
    exceptionHandlers.push(
        new winston.transports.File({
            filename: 'logs/exceptions.log',
            format: combine(
                errors({ stack: true }),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                logFormat
            )
        })
    );

    rejectionHandlers.push(
        new winston.transports.File({
            filename: 'logs/rejections.log',
            format: combine(
                errors({ stack: true }),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                logFormat
            )
        })
    );
}

// Add custom log levels to support trace
const customLevels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        verbose: 4,
        debug: 5,
        trace: 6,
        silly: 7
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        info: 'green',
        http: 'magenta',
        verbose: 'cyan',
        debug: 'blue',
        trace: 'gray',
        silly: 'rainbow'
    }
};

// Add colors to winston
winston.addColors(customLevels.colors);

// Create logger instance
export const logger = winston.createLogger({
    level: config.LOG_LEVEL || 'info',
    levels: customLevels.levels,
    format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports,
    exceptionHandlers,
    rejectionHandlers
});

// Helper function to create child loggers (proper implementation)
export const createChildLogger = (moduleName) => {
    return logger.child({ module: moduleName });
};

// Add helper methods for better debugging
logger.logObject = (level, message, obj) => {
    logger[level](message, { object: obj });
};

// Special handler for Baileys logs to avoid [object Object]
logger.baileys = (level, message, data) => {
    if (typeof data === 'object' && data !== null) {
        try {
            const serialized = JSON.stringify(data, (key, value) => {
                // Handle Buffer objects
                if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
                    return `[Buffer: ${value.data.length} bytes]`;
                }
                // Handle circular references
                if (typeof value === 'object' && value !== null) {
                    if (value.constructor?.name) {
                        return `[${value.constructor.name}]`;
                    }
                }
                return value;
            }, 2);
            logger[level](`[baileys] ${message}: ${serialized}`);
        } catch (err) {
            logger[level](`[baileys] ${message}: [Complex Object - ${data.constructor?.name || 'Unknown'}]`);
        }
    } else {
        logger[level](`[baileys] ${message}: ${data}`);
    }
};
