/**
 * @fileoverview 에러 처리 통합 인덱스
 * 모든 에러 클래스와 유틸리티를 중앙에서 관리
 */

// === 기본 에러 핸들링 ===
export type { ApiError } from '@/middleware/errorHandler.js';
export {
  AppError,
  errorHandler,
  asyncHandler,
  createError
} from '@/middleware/errorHandler.js';

// === Repository 에러들 ===
export {
  // 기본 Repository 에러 클래스들
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

  // Repository별 전용 에러들
  SubwayStationError,
  MeetingPointError,
  NaverApiError,

  // 에러 팩토리 및 유틸리티
  RepositoryErrors,
  mapToRepositoryError,

  // 타입 가드들
  isRepositoryError,
  isEntityNotFoundError,
  isEntityConflictError,
  isEntityValidationError
} from './repository.errors.js';

// === 에러 처리 가이드라인 ===

/**
 * 에러 처리 표준 가이드라인
 *
 * 1. Repository 계층 에러 처리:
 *    - Repository에서 발생하는 모든 에러는 RepositoryError 또는 그 하위 클래스 사용
 *    - mapToRepositoryError 함수로 일반 Error를 Repository 에러로 변환
 *    - 각 Repository별로 전용 에러 클래스 사용 (SubwayStationError, MeetingPointError 등)
 *
 * 2. Service 계층 에러 처리:
 *    - Repository에서 전파된 에러를 적절히 처리하거나 재전송
 *    - 비즈니스 로직 에러는 AppError 사용
 *    - 외부 API 호출 실패는 해당하는 Repository 에러로 변환
 *
 * 3. Controller 계층 에러 처리:
 *    - asyncHandler로 async 함수 래핑하여 자동 에러 처리
 *    - 요청 검증 실패는 ZodError가 자동으로 처리됨
 *    - 명시적인 에러 응답이 필요한 경우만 직접 처리
 *
 * 4. 에러 응답 포맷:
 *    - success: false
 *    - error: 에러 코드 (예: ENTITY_NOT_FOUND)
 *    - message: 사용자용 메시지
 *    - details: 상세 정보 (개발 환경에서만)
 *    - timestamp: 발생 시간
 *    - requestId: 요청 추적 ID
 *    - path: 요청 경로
 *    - method: HTTP 메소드
 *
 * 5. 로깅 정책:
 *    - 4xx 에러: 개발 환경에서만 로그
 *    - 5xx 에러: 항상 로그
 *    - Repository 에러: 에러 타입과 Repository 정보 포함
 *    - 스택 트레이스: 개발 환경에서만 포함
 */

// === 에러 처리 예시들 ===

/*
// Repository에서:
async findById(id: string): Promise<SubwayStation | null> {
  try {
    const result = await this.database.query(sql);
    if (!result) {
      throw new EntityNotFoundError('SubwayStation', id, 'SubwayStationRepository');
    }
    return result;
  } catch (error) {
    if (error instanceof RepositoryError) {
      throw error; // Repository 에러는 그대로 전파
    }
    // 일반 에러를 Repository 에러로 변환
    throw mapToRepositoryError(error, 'SubwayStationRepository', 'findById');
  }
}

// Service에서:
async getStationById(id: string): Promise<SubwayStation> {
  try {
    const station = await this.stationRepository.findById(id);
    return station;
  } catch (error) {
    if (isEntityNotFoundError(error)) {
      // 사용자 친화적 메시지로 변환
      throw new AppError(
        `지하철역 정보를 찾을 수 없습니다 (ID: ${id})`,
        404,
        'STATION_NOT_FOUND'
      );
    }
    throw error; // 기타 Repository 에러는 그대로 전파
  }
}

// Controller에서:
export const getStation = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // 요청 검증은 미들웨어에서 자동 처리
  const station = await stationService.getStationById(id);

  res.json({
    success: true,
    data: station,
    timestamp: new Date().toISOString()
  });
  // 에러 처리는 errorHandler 미들웨어에서 자동 처리
});
*/