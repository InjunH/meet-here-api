import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logError } from '@/utils/logger.js';
import { serverConfig } from '@/config/index.js';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;
  public details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Error handler middleware
export const errorHandler = (
  error: Error | ApiError | ZodError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal Server Error';
  let details: any = undefined;

  // Handle different error types
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid request data';
    details = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code
    }));
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = error.message;
  } else if (error.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'Invalid ID format';
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token expired';
  } else if ('statusCode' in error && error.statusCode) {
    statusCode = error.statusCode;
    message = error.message;
    code = (error as ApiError).code || 'API_ERROR';
  }

  // Log error (only log 5xx errors in production)
  if (statusCode >= 500 || !serverConfig.isProduction) {
    logError(error, req);
  }

  // Send error response
  const errorResponse = {
    success: false,
    error: code,
    message,
    ...(details && { details }),
    ...(serverConfig.isDevelopment && {
      stack: error.stack,
      originalError: error.message
    }),
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'],
    path: req.originalUrl,
    method: req.method
  };

  res.status(statusCode).json(errorResponse);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Create common error instances
export const createError = {
  badRequest: (message: string, details?: any) =>
    new AppError(message, 400, 'BAD_REQUEST', true, details),

  unauthorized: (message: string = 'Unauthorized') =>
    new AppError(message, 401, 'UNAUTHORIZED', true),

  forbidden: (message: string = 'Forbidden') =>
    new AppError(message, 403, 'FORBIDDEN', true),

  notFound: (message: string = 'Resource not found') =>
    new AppError(message, 404, 'NOT_FOUND', true),

  conflict: (message: string, details?: any) =>
    new AppError(message, 409, 'CONFLICT', true, details),

  tooManyRequests: (message: string = 'Too many requests') =>
    new AppError(message, 429, 'TOO_MANY_REQUESTS', true),

  internal: (message: string = 'Internal server error', details?: any) =>
    new AppError(message, 500, 'INTERNAL_ERROR', false, details),

  serviceUnavailable: (message: string = 'Service unavailable') =>
    new AppError(message, 503, 'SERVICE_UNAVAILABLE', true)
};
