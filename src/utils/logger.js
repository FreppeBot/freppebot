/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     LOGGER                                     ║
 * ║                                                                 ║
 * ║   Winston-based logging with pretty console output             ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const winston = require('winston');

const logLevel = process.env.LOG_LEVEL || 'info';

const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        // Console output with colors
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ level, message, timestamp, stack }) => {
                    if (stack) {
                        return `${timestamp} ${level}: ${message}\n${stack}`;
                    }
                    return `${timestamp} ${level}: ${message}`;
                })
            ),
        }),
        // File output for debugging
        new winston.transports.File({
            filename: 'data/freppebot.log',
            maxsize: 5242880, // 5MB
            maxFiles: 3,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
        }),
    ],
});

module.exports = logger;
