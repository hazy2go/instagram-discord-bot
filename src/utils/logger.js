import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configure Winston logger with multiple transports
 * - Console output with colors for development
 * - File output for production logs
 * - Error file for error-level logs
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'instagram-discord-bot' },
  transports: [
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(__dirname, '../../data/logs/combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    // Write error logs to error.log
    new winston.transports.File({
      filename: path.join(__dirname, '../../data/logs/error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

// If not in production, also log to console with colors
if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_MODE === 'true') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, service, ...metadata }) => {
        let msg = `${timestamp} [${level}]: ${message}`;

        // Add metadata if present
        if (Object.keys(metadata).length > 0) {
          msg += ` ${JSON.stringify(metadata)}`;
        }

        return msg;
      })
    )
  }));
}

/**
 * Create a child logger with a specific label
 * @param {string} label - Label for the logger (e.g., 'Instagram', 'Monitor', 'Database')
 * @returns {winston.Logger} Child logger instance
 */
export function createLogger(label) {
  return logger.child({ label });
}

export default logger;
