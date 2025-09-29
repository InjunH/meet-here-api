import winston from 'winston';
import { loggingConfig, serverConfig } from '@/config/index.js';

const logLevel = loggingConfig.level;
const logFile = loggingConfig.filePath;

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta,
      service: 'meethere-api',
      version: '1.0.0'
    });
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.simple(),
  winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}]: ${message}`;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: {
    service: 'meethere-api',
    environment: serverConfig.nodeEnv
  },
  transports: [
    // File logging
    new winston.transports.File({
      filename: logFile.replace('.log', '-error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: logFile,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({ filename: './logs/exceptions.log' })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: './logs/rejections.log' })
  ]
});

// Add console logging for development
if (!serverConfig.isProduction) {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Helper functions
export const logRequest = (req: any, _res: any) => {
  logger.info('API Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.headers['x-request-id'],
    deviceId: req.headers['x-device-id']
  });
};

export const logResponse = (req: any, res: any, duration: number) => {
  logger.info('API Response', {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    requestId: req.headers['x-request-id']
  });
};

export const logError = (error: Error, req?: any) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    url: req?.url,
    method: req?.method,
    requestId: req?.headers?.['x-request-id'],
    timestamp: new Date().toISOString()
  });
};
