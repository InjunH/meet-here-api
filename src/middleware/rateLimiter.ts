import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { rateLimitConfig } from '@/config/index.js';

// Rate limiting configuration
const windowMs = rateLimitConfig.windowMs;
const maxRequests = rateLimitConfig.maxRequests;
const maxRequestsAuth = rateLimitConfig.maxRequestsAuth;

// Custom key generator based on IP and user authentication status
const keyGenerator = (req: Request): string => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userId = req.headers['x-user-id'] as string;
  const deviceId = req.headers['x-device-id'] as string;

  // Use userId if available, otherwise use deviceId or IP
  return userId || deviceId || ip;
};

// Dynamic limit based on authentication status
const limitFunction = (req: Request): number => {
  const isAuthenticated = !!(req.headers['x-user-id'] || req.headers.authorization);
  return isAuthenticated ? maxRequestsAuth : maxRequests;
};

// Skip rate limiting for certain routes
const skipFunction = (req: Request): boolean => {
  const skipRoutes = ['/health', '/metrics'];
  return skipRoutes.some(route => req.path.startsWith(route));
};

// Main rate limiter
export const rateLimiter = rateLimit({
  windowMs,
  limit: limitFunction,
  keyGenerator,
  skip: skipFunction,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const resetTime = new Date(Date.now() + windowMs);

    res.status(429).json({
      success: false,
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this IP, please try again later',
      retryAfter: Math.round(windowMs / 1000),
      resetTime: resetTime.toISOString(),
      limit: limitFunction(req),
      timestamp: new Date().toISOString()
    });
  }
});

// Stricter rate limiter for sensitive endpoints
export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // Max 5 requests per 15 minutes
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many sensitive requests, please try again later',
      retryAfter: 900, // 15 minutes
      timestamp: new Date().toISOString()
    });
  }
});

// Kakao API rate limiter (external API calls)
export const kakaoApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30, // Kakao API limits
  keyGenerator,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'EXTERNAL_API_LIMIT',
      message: 'External API rate limit exceeded, please try again later',
      retryAfter: 60,
      timestamp: new Date().toISOString()
    });
  }
});
