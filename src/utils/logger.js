import winston from 'winston';
import fs from 'fs';
import { config } from '../config/config.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack, module }) => {
    const modulePrefix = module ? `[${module}] ` : '';
    return `${timestamp} ${level}: ${modulePrefix}${stack || message}`;
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

// Create logger instance
export const logger = winston.createLogger({
    level: config.LOG_LEVEL || 'info',
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
