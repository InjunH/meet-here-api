import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logError } from '@/utils/logger.js';
import { serverConfig } from '@/config/index.js';
import {
  RepositoryError,
  EntityNotFoundError,
  EntityConflictError,
  EntityValidationError,
  EntityRelationError,
  DatabaseConnectionError,
  QueryExecutionError,
  TransactionError,
  CacheError,
  PaginationError,
  isRepositoryError,
  isEntityNotFoundError,
  isEntityConflictError,
  isEntityValidationError
} from '@/errors/repository.errors.js';

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
  error: Error | ApiError | ZodError | RepositoryError,
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
  } else if (isRepositoryError(error)) {
    // Repository 에러 처리
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;

    // Repository 정보 추가
    details = {
      ...error.details,
      repository: error.repositoryName,
      operation: error.operation
    };

    // EntityValidationError의 경우 validation errors도 포함
    if (isEntityValidationError(error)) {
      details.validationErrors = error.validationErrors;
    }

    // 특정 Repository 에러 타입별 추가 처리
    if (error instanceof DatabaseConnectionError) {
      // DB 연결 에러는 서비스 이용 불가로 처리
      statusCode = 503;
      message = '일시적으로 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.';
    } else if (error instanceof CacheError) {
      // 캐시 에러는 보통 서비스에 치명적이지 않으므로 내부 에러로 처리
      statusCode = 500;
      message = '내부 시스템 오류가 발생했습니다.';
    } else if (error instanceof TransactionError) {
      // 트랜잭션 에러는 데이터 일관성 문제일 수 있으므로 내부 에러로 처리
      statusCode = 500;
      message = '데이터 처리 중 오류가 발생했습니다.';
    }
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
  // 일반적인 HTTP 에러들
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
    new AppError(message, 503, 'SERVICE_UNAVAILABLE', true),

  // Repository 계층 에러들
  repository: {
    entityNotFound: (entityType: string, id: string | number, repositoryName: string) =>
      new EntityNotFoundError(entityType, id, repositoryName),

    entityConflict: (entityType: string, field: string, value: any, repositoryName: string) =>
      new EntityConflictError(entityType, field, value, repositoryName),

    validation: (
      entityType: string,
      errors: Array<{ field: string; message: string; value?: any }>,
      repositoryName: string,
      operation: string
    ) =>
      new EntityValidationError(entityType, errors, repositoryName, operation),

    dbConnection: (repositoryName: string, operation: string, originalError?: Error) =>
      new DatabaseConnectionError(repositoryName, operation, originalError),

    queryExecution: (repositoryName: string, operation: string, query?: string, originalError?: Error) =>
      new QueryExecutionError(repositoryName, operation, query, originalError),

    transaction: (
      repositoryName: string,
      operation: string,
      phase: 'begin' | 'commit' | 'rollback',
      originalError?: Error
    ) =>
      new TransactionError(repositoryName, operation, phase, originalError),

    cache: (
      repositoryName: string,
      operation: string,
      cacheOp: 'get' | 'set' | 'delete' | 'clear',
      originalError?: Error
    ) =>
      new CacheError(repositoryName, operation, cacheOp, originalError),

    pagination: (repositoryName: string, param: string, value: any, expectedRange?: string) =>
      new PaginationError(repositoryName, param, value, expectedRange)
  }
};
