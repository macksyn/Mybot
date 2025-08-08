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
    } else if (typeof message === 'object') {
        try {
            formattedMessage = JSON.stringify(message, (key, value) => {
                if (value && value.type === 'Buffer') {
                    return `[Buffer: ${value.data?.length || 0} bytes]`;
                }
                if (typeof value === 'object' && value !== null && value.constructor?.name !== 'Object') {
                    return `[${value.constructor.name}]`;
                }
                return value;
            }, 2);
        } catch {
            formattedMessage = message.toString();
        }
    } else {
        formattedMessage = message || '';
    }
    
    // Add metadata if present
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    
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

// Create child logger function
export const createChildLogger = (moduleName) => {
    return logger.child({ module: moduleName });
};

// Enhanced logging methods
logger.success = (message, ...args) => logger.info(`✅ ${message}`, ...args);
logger.error = (message, ...args) => logger.log('error', `❌ ${message}`, ...args);
logger.warn = (message, ...args) => logger.log('warn', `⚠️  ${message}`, ...args);
logger.debug = (message, ...args) => logger.log('debug', `🔍 ${message}`, ...args);

// Special handler for objects
logger.logObject = (level, message, obj) => {
    logger[level](`${message}:`, obj);
};

// Handle Baileys logs properly
logger.child = (options) => {
    const childLogger = winston.createLogger({
        level: logger.level,
        format: logger.format,
        transports: logger.transports,
        parent: logger
    });
    
    // Override log method to handle Baileys format
    const originalLog = childLogger.log;
    childLogger.log = function(level, message, meta) {
        if (typeof level === 'object') {
            // Baileys format: log({ level, msg, ...data })
            const { level: logLevel, msg, ...data } = level;
            return originalLog.call(this, logLevel || 'info', msg, { module: options.module || options.stream, ...data });
        } else {
            return originalLog.call(this, level, message, { module: options.module || options.stream, ...meta });
        }
    };
    
    return childLogger;
};
