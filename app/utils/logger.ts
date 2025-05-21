import winston from 'winston';
import path from 'path';
import { config } from '../config/config';

// Custom format for consistent log messages
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level.toUpperCase()}] ${message}`;
  
  // Add metadata if present, but filter out large objects
  if (Object.keys(metadata).length > 0) {
    const cleanMetadata = { ...metadata };
    // Remove large objects or sensitive data
    delete cleanMetadata.stack;
    delete cleanMetadata.config;
    msg += ` ${JSON.stringify(cleanMetadata)}`;
  }
  
  return msg;
});

// Create the logger
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    customFormat
  ),
  transports: [
    // Console output with colored levels
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    }),
    // File output for errors
    new winston.transports.File({
      filename: path.join(config.paths.tempDir, config.paths.logsDir, 'error.log'),
      level: 'error'
    }),
    // File output for all logs
    new winston.transports.File({
      filename: path.join(config.paths.tempDir, config.paths.logsDir, 'combined.log')
    })
  ]
});

// Add request logging format
export const requestLogger = winston.format.printf(({ level, message, timestamp, method, path, status, responseTime }) => {
  return `${timestamp} [${level.toUpperCase()}] ${method} ${path} ${status} ${responseTime}ms`;
});
