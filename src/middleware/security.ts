import { Request, Response, NextFunction } from 'express';
import { securityConfig, serverConfig } from '@/config/index.js';

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // HSTS (HTTP Strict Transport Security)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // X-Content-Type-Options
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // X-Frame-Options
  res.setHeader('X-Frame-Options', 'DENY');

  // X-XSS-Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  res.setHeader('Permissions-Policy', [
    'camera=()',
    'microphone=()',
    'geolocation=(self)',
    'payment=()'
  ].join(', '));

  // Remove potentially sensitive headers
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  next();
};

// API Key validation middleware
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;
  const validApiKeys = securityConfig.validApiKeys;

  // Skip API key validation in development
  if (serverConfig.isDevelopment) {
    return next();
  }

  if (!apiKey || !validApiKeys.includes(apiKey)) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_API_KEY',
      message: 'Valid API key required',
      timestamp: new Date().toISOString()
    });
  }

  next();
};

// Device ID validation middleware
export const validateDeviceId = (req: Request, res: Response, next: NextFunction) => {
  const deviceId = req.headers['x-device-id'] as string;

  if (!deviceId) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_DEVICE_ID',
      message: 'Device ID header is required',
      timestamp: new Date().toISOString()
    });
  }

  // Basic device ID format validation
  if (!/^[a-zA-Z0-9-_]{8,128}$/.test(deviceId)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_DEVICE_ID',
      message: 'Device ID format is invalid',
      timestamp: new Date().toISOString()
    });
  }

  next();
};

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Recursively sanitize object
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      // Remove potential XSS patterns
      return obj
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .trim();
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }

    return obj;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
};
