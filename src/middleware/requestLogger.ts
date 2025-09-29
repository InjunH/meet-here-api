import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logRequest, logResponse } from '@/utils/logger.js';
import { loggingConfig } from '@/config/index.js';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  // Generate request ID if not provided
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = uuidv4();
  }

  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.headers['x-request-id']);

  // Log request if logging is enabled
  if (loggingConfig.requestLogging) {
    logRequest(req, res);
  }

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function (data) {
    const duration = Date.now() - startTime;

    // Log response if logging is enabled
    if (loggingConfig.requestLogging) {
      logResponse(req, res, duration);
    }

    // Add performance headers
    res.setHeader('X-Response-Time', `${duration}ms`);
    res.setHeader('X-Powered-By', 'MeetHere-API');

    // Call original json method
    return originalJson.call(this, data);
  };

  next();
};
