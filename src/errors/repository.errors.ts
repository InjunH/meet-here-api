/**
 * @fileoverview Repository 계층 전용 에러 클래스들
 * Repository 패턴에서 발생하는 다양한 에러 타입들을 정의
 */

// AppError 직접 정의 (순환 참조 방지)
export class BaseAppError extends Error {
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
    this.name = 'BaseAppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Repository 기본 에러 클래스
 */
export class RepositoryError extends BaseAppError {
  public readonly repositoryName: string;
  public readonly operation: string;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    repositoryName: string,
    operation: string,
    details?: any
  ) {
    super(message, statusCode, code, true, details);
    this.name = 'RepositoryError';
    this.repositoryName = repositoryName;
    this.operation = operation;
  }
}

/**
 * 데이터를 찾을 수 없을 때 발생하는 에러
 */
export class EntityNotFoundError extends RepositoryError {
  constructor(
    entityType: string,
    identifier: string | number,
    repositoryName: string,
    details?: any
  ) {
    const message = `${entityType} with identifier '${identifier}' not found`;
    super(message, 404, 'ENTITY_NOT_FOUND', repositoryName, 'find', details);
    this.name = 'EntityNotFoundError';
  }
}

/**
 * 데이터 생성 시 중복으로 인한 에러
 */
export class EntityConflictError extends RepositoryError {
  constructor(
    entityType: string,
    conflictField: string,
    value: any,
    repositoryName: string,
    details?: any
  ) {
    const message = `${entityType} with ${conflictField} '${value}' already exists`;
    super(message, 409, 'ENTITY_CONFLICT', repositoryName, 'create', details);
    this.name = 'EntityConflictError';
  }
}

/**
 * 데이터 유효성 검증 실패 에러
 */
export class EntityValidationError extends RepositoryError {
  public readonly validationErrors: Array<{
    field: string;
    message: string;
    value?: any;
  }>;

  constructor(
    entityType: string,
    validationErrors: Array<{ field: string; message: string; value?: any }>,
    repositoryName: string,
    operation: string,
    details?: any
  ) {
    const message = `${entityType} validation failed`;
    super(message, 400, 'ENTITY_VALIDATION_ERROR', repositoryName, operation, details);
    this.name = 'EntityValidationError';
    this.validationErrors = validationErrors;
  }
}

/**
 * 연결 관계 제약 위반 에러
 */
export class EntityRelationError extends RepositoryError {
  constructor(
    entityType: string,
    relationshipType: string,
    message: string,
    repositoryName: string,
    operation: string,
    details?: any
  ) {
    const fullMessage = `${entityType} ${relationshipType} constraint violation: ${message}`;
    super(fullMessage, 400, 'ENTITY_RELATION_ERROR', repositoryName, operation, details);
    this.name = 'EntityRelationError';
  }
}

/**
 * 데이터베이스 연결 에러
 */
export class DatabaseConnectionError extends RepositoryError {
  constructor(
    repositoryName: string,
    operation: string,
    originalError?: Error,
    details?: any
  ) {
    const message = `Database connection failed in ${repositoryName}`;
    super(message, 503, 'DATABASE_CONNECTION_ERROR', repositoryName, operation, {
      ...details,
      originalError: originalError?.message
    });
    this.name = 'DatabaseConnectionError';
  }
}

/**
 * 쿼리 실행 에러
 */
export class QueryExecutionError extends RepositoryError {
  constructor(
    repositoryName: string,
    operation: string,
    query?: string,
    originalError?: Error,
    details?: any
  ) {
    const message = `Query execution failed in ${repositoryName}`;
    super(message, 500, 'QUERY_EXECUTION_ERROR', repositoryName, operation, {
      ...details,
      query,
      originalError: originalError?.message
    });
    this.name = 'QueryExecutionError';
  }
}

/**
 * 트랜잭션 에러
 */
export class TransactionError extends RepositoryError {
  constructor(
    repositoryName: string,
    operation: string,
    phase: 'begin' | 'commit' | 'rollback',
    originalError?: Error,
    details?: any
  ) {
    const message = `Transaction ${phase} failed in ${repositoryName}`;
    super(message, 500, 'TRANSACTION_ERROR', repositoryName, operation, {
      ...details,
      phase,
      originalError: originalError?.message
    });
    this.name = 'TransactionError';
  }
}

/**
 * 캐시 관련 에러
 */
export class CacheError extends RepositoryError {
  constructor(
    repositoryName: string,
    operation: string,
    cacheOperation: 'get' | 'set' | 'delete' | 'clear',
    originalError?: Error,
    details?: any
  ) {
    const message = `Cache ${cacheOperation} operation failed in ${repositoryName}`;
    super(message, 500, 'CACHE_ERROR', repositoryName, operation, {
      ...details,
      cacheOperation,
      originalError: originalError?.message
    });
    this.name = 'CacheError';
  }
}

/**
 * 페이지네이션 관련 에러
 */
export class PaginationError extends RepositoryError {
  constructor(
    repositoryName: string,
    invalidParam: string,
    value: any,
    expectedRange?: string,
    details?: any
  ) {
    const message = `Invalid pagination parameter '${invalidParam}': ${value}${expectedRange ? ` (expected: ${expectedRange})` : ''}`;
    super(message, 400, 'PAGINATION_ERROR', repositoryName, 'paginate', details);
    this.name = 'PaginationError';
  }
}

// === Repository별 전용 에러들 ===

/**
 * SubwayStation Repository 전용 에러
 */
export class SubwayStationError extends RepositoryError {
  constructor(
    message: string,
    statusCode: number,
    code: string,
    operation: string,
    details?: any
  ) {
    super(message, statusCode, code, 'SubwayStationRepository', operation, details);
    this.name = 'SubwayStationError';
  }

  static stationNotFound(identifier: string) {
    return new EntityNotFoundError('SubwayStation', identifier, 'SubwayStationRepository');
  }

  static invalidCoordinates(lat: number, lng: number) {
    return new EntityValidationError(
      'SubwayStation',
      [{ field: 'coordinates', message: `Invalid coordinates: (${lat}, ${lng})` }],
      'SubwayStationRepository',
      'validate'
    );
  }

  static invalidSearchRadius(radius: number) {
    return new EntityValidationError(
      'SubwayStation',
      [{ field: 'radius', message: `Invalid search radius: ${radius} (expected: 0-10000m)` }],
      'SubwayStationRepository',
      'search'
    );
  }
}

/**
 * MeetingPoint Repository 전용 에러
 */
export class MeetingPointError extends RepositoryError {
  constructor(
    message: string,
    statusCode: number,
    code: string,
    operation: string,
    details?: any
  ) {
    super(message, statusCode, code, 'MeetingPointRepository', operation, details);
    this.name = 'MeetingPointError';
  }

  static sessionNotFound(sessionId: string) {
    return new EntityNotFoundError('MeetingSession', sessionId, 'MeetingPointRepository');
  }

  static sessionExpired(sessionId: string, expiredAt: Date) {
    return new EntityValidationError(
      'MeetingSession',
      [{ field: 'expiresAt', message: `Session expired at ${expiredAt.toISOString()}` }],
      'MeetingPointRepository',
      'find',
      { sessionId }
    );
  }

  static tooManyParticipants(count: number, maxAllowed: number) {
    return new EntityValidationError(
      'MeetingSession',
      [{ field: 'participants', message: `Too many participants: ${count} (max: ${maxAllowed})` }],
      'MeetingPointRepository',
      'validate'
    );
  }

  static invalidParticipant(participantName: string, reason: string) {
    return new EntityValidationError(
      'MeetingSession',
      [{ field: 'participants', message: `Invalid participant '${participantName}': ${reason}` }],
      'MeetingPointRepository',
      'validate'
    );
  }
}

/**
 * Naver API Repository 전용 에러
 */
export class NaverApiError extends RepositoryError {
  constructor(
    message: string,
    statusCode: number,
    code: string,
    operation: string,
    details?: any
  ) {
    super(message, statusCode, code, 'NaverApiRepository', operation, details);
    this.name = 'NaverApiError';
  }

  static cacheExpired(cacheType: 'reverseGeocode' | 'search', key: string) {
    return new CacheError(
      'NaverApiRepository',
      'getCacheItem',
      'get',
      new Error(`${cacheType} cache expired for key: ${key}`)
    );
  }

  static invalidCacheKey(cacheType: 'reverseGeocode' | 'search', key: string) {
    return new EntityValidationError(
      'NaverApiCache',
      [{ field: 'cacheKey', message: `Invalid ${cacheType} cache key format: ${key}` }],
      'NaverApiRepository',
      'validateCacheKey'
    );
  }

  static usageRecordNotFound(recordId: string) {
    return new EntityNotFoundError('ApiUsage', recordId, 'NaverApiRepository');
  }
}

// === 에러 팩토리 함수들 ===

/**
 * Repository 에러 팩토리
 * 공통적으로 사용되는 Repository 에러들을 쉽게 생성할 수 있는 유틸리티
 */
export const RepositoryErrors = {
  // 일반적인 Repository 에러들
  notFound: (entityType: string, id: string | number, repositoryName: string) =>
    new EntityNotFoundError(entityType, id, repositoryName),

  conflict: (entityType: string, field: string, value: any, repositoryName: string) =>
    new EntityConflictError(entityType, field, value, repositoryName),

  validation: (entityType: string, errors: Array<{ field: string; message: string; value?: any }>, repositoryName: string, operation: string) =>
    new EntityValidationError(entityType, errors, repositoryName, operation),

  dbConnection: (repositoryName: string, operation: string, originalError?: Error) =>
    new DatabaseConnectionError(repositoryName, operation, originalError),

  query: (repositoryName: string, operation: string, query?: string, originalError?: Error) =>
    new QueryExecutionError(repositoryName, operation, query, originalError),

  cache: (repositoryName: string, operation: string, cacheOp: 'get' | 'set' | 'delete' | 'clear', originalError?: Error) =>
    new CacheError(repositoryName, operation, cacheOp, originalError),

  pagination: (repositoryName: string, param: string, value: any, expectedRange?: string) =>
    new PaginationError(repositoryName, param, value, expectedRange),

  // Repository별 전용 에러들
  subway: SubwayStationError,
  meeting: MeetingPointError,
  naver: NaverApiError
};

/**
 * 에러 매핑 헬퍼 함수
 * 기본 Error를 적절한 Repository 에러로 변환
 */
export const mapToRepositoryError = (
  error: Error,
  repositoryName: string,
  operation: string,
  context?: any
): RepositoryError => {
  // 이미 Repository 에러인 경우 그대로 반환
  if (error instanceof RepositoryError) {
    return error;
  }

  // 일반적인 에러들을 Repository 에러로 매핑
  if (error.name === 'ValidationError') {
    return new EntityValidationError(
      'Entity',
      [{ field: 'unknown', message: error.message }],
      repositoryName,
      operation,
      context
    );
  }

  if (error.message.includes('not found') || error.message.includes('Not found')) {
    return new EntityNotFoundError('Entity', 'unknown', repositoryName, context);
  }

  if (error.message.includes('duplicate') || error.message.includes('already exists')) {
    return new EntityConflictError('Entity', 'unknown', 'unknown', repositoryName, context);
  }

  if (error.message.includes('connection') || error.message.includes('timeout')) {
    return new DatabaseConnectionError(repositoryName, operation, error, context);
  }

  // 기본적으로 QueryExecutionError로 매핑
  return new QueryExecutionError(repositoryName, operation, undefined, error, context);
};

/**
 * Repository 에러인지 확인하는 타입 가드
 */
export const isRepositoryError = (error: any): error is RepositoryError => {
  return error instanceof RepositoryError;
};

/**
 * 특정 Repository 에러 타입인지 확인하는 타입 가드들
 */
export const isEntityNotFoundError = (error: any): error is EntityNotFoundError => {
  return error instanceof EntityNotFoundError;
};

export const isEntityConflictError = (error: any): error is EntityConflictError => {
  return error instanceof EntityConflictError;
};

export const isEntityValidationError = (error: any): error is EntityValidationError => {
  return error instanceof EntityValidationError;
};