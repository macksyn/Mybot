import winston from 'winston';
import { config } from '../config/config.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack, module }) => {
    const modulePrefix = module ? `[${module}] ` : '';
    return `${timestamp} ${level}: ${modulePrefix}${stack || message}`;
});

// Create logger instance
export const logger = winston.createLogger({
    level: config.LOG_LEVEL,
    format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        // Console transport with colors
        new winston.transports.Console({
            format: combine(
                colorize(),
                errors({ stack: true }),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                logFormat
            )
        })
    ],
    // Handle exceptions and rejections
    exceptionHandlers: [
        new winston.transports.Console({
            format: combine(
                colorize(),
                errors({ stack: true }),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                logFormat
            )
        })
    ],
    rejectionHandlers: [
        new winston.transports.Console({
            format: combine(
                colorize(),
                errors({ stack: true }),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                logFormat
            )
        })
    ]
});

// Add file transport if enabled
if (config.LOG_TO_FILE) {
    // Ensure logs directory exists
    import('fs').then(fs => {
        if (!fs.existsSync('logs')) {
            fs.mkdirSync('logs');
        }
    });
    
    logger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: combine(
            errors({ stack: true }),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            logFormat
        )
    }));
    
    logger.add(new winston.transports.File({
        filename: 'logs/combined.log',
        format: combine(
            errors({ stack: true }),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            logFormat
        )
    }));
}

// Helper function to create child loggers
logger.child = (meta) => {
    return winston.createLogger({
        level: config.LOG_LEVEL,
        format: combine(
            errors({ stack: true }),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.metadata({ key: 'module' }),
            logFormat
        ),
        defaultMeta: meta,
        transports: logger.transports
    });
};
