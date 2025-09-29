# 에러 처리 시스템 가이드

## 📖 목차

1. [개요](#개요)
2. [에러 계층 구조](#에러-계층-구조)
3. [Repository 에러 시스템](#repository-에러-시스템)
4. [에러 처리 워크플로우](#에러-처리-워크플로우)
5. [실전 예제 모음](#실전-예제-모음)
6. [모범 사례 및 안티패턴](#모범-사례-및-안티패턴)
7. [모니터링 및 로깅](#모니터링-및-로깅)

---

## 개요

MeetHere API는 **계층별 에러 처리 전략**을 통해 안정적이고 사용자 친화적인 에러 관리를 제공합니다.

### 🎯 설계 원칙

1. **계층별 책임 분리**: 각 계층은 해당 수준의 에러만 처리
2. **타입 안전성**: TypeScript를 활용한 컴파일 시점 에러 검증
3. **사용자 중심**: 개발자와 최종 사용자 모두를 고려한 에러 메시지
4. **추적 가능성**: 에러 발생 지점부터 최종 응답까지 완전한 추적
5. **복구 가능성**: 가능한 경우 자동 복구 및 대체 동작 제공

### 🏗️ 전체 에러 처리 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client Request                                │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                Controller Layer                                 │
│  • HTTP 상태 코드 매핑                                            │
│  • 요청 검증 에러 처리 (Zod)                                      │
│  • asyncHandler로 자동 에러 전파                                  │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                 Service Layer                                   │
│  • 비즈니스 로직 에러 처리                                        │
│  • Repository 에러 변환                                          │
│  • 사용자 친화적 메시지 생성                                       │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│               Repository Layer                                  │
│  • 데이터 접근 에러 처리                                          │
│  • 외부 API 에러 매핑                                            │
│  • 캐시/DB 연결 에러 관리                                         │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│              Error Handler Middleware                          │
│  • 모든 에러의 최종 처리                                          │
│  • 통일된 응답 형식 생성                                          │
│  • 로깅 및 모니터링 연동                                          │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                Client Response                                  │
│  • 표준화된 에러 응답                                             │
│  • 적절한 HTTP 상태 코드                                          │
│  • 개발/운영 환경별 정보 조절                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 에러 계층 구조

### 🏛️ 기본 에러 클래스 계층

```typescript
Error (JavaScript 기본)
└── BaseAppError
    ├── AppError (일반적인 애플리케이션 에러)
    └── RepositoryError (데이터 접근 계층 에러)
        ├── EntityNotFoundError
        ├── EntityConflictError
        ├── EntityValidationError
        ├── EntityRelationError
        ├── DatabaseConnectionError
        ├── QueryExecutionError
        ├── TransactionError
        ├── CacheError
        └── PaginationError
```

### 📊 에러 속성 및 메타데이터

```typescript
interface ErrorMetadata {
  // 기본 속성
  name: string;
  message: string;
  statusCode: number;
  code: string;
  isOperational: boolean;

  // Repository 전용 속성
  repositoryName?: string;
  operation?: string;

  // 추가 정보
  details?: any;
  timestamp?: Date;
  requestId?: string;
  userId?: string;
}
```

### 🎨 에러 코드 체계

**패턴**: `{DOMAIN}_{ACTION}_{REASON}`

```typescript
// Repository 계층
ENTITY_NOT_FOUND        // 엔티티를 찾을 수 없음
ENTITY_CONFLICT         // 중복 데이터 충돌
ENTITY_VALIDATION_ERROR // 데이터 검증 실패
DATABASE_CONNECTION_ERROR // DB 연결 실패
QUERY_EXECUTION_ERROR   // 쿼리 실행 실패
CACHE_ERROR            // 캐시 작업 실패

// 비즈니스 로직 계층
INVALID_COORDINATES    // 잘못된 좌표
TOO_MANY_PARTICIPANTS  // 참가자 수 초과
SESSION_EXPIRED        // 세션 만료
INSUFFICIENT_DATA      // 데이터 부족

// HTTP 계층
VALIDATION_ERROR       // 요청 검증 실패
UNAUTHORIZED          // 인증 실패
FORBIDDEN             // 권한 없음
NOT_FOUND             // 리소스 없음
```

---

## Repository 에러 시스템

### 🔧 에러 생성 및 매핑

**1. 직접 에러 생성**
```typescript
// 엔티티를 찾을 수 없는 경우
throw new EntityNotFoundError('SubwayStation', stationId, 'SubwayStationRepository');

// 검증 실패
throw new EntityValidationError(
  'MeetingSession',
  [
    { field: 'participants', message: '최소 2명 이상이어야 합니다', value: 1 },
    { field: 'location', message: '유효한 좌표가 아닙니다', value: { lat: 91, lng: 181 } }
  ],
  'MeetingPointRepository',
  'create'
);
```

**2. 에러 매핑 유틸리티 사용**
```typescript
export class SubwayStationRepository {
  async findById(id: string): Promise<SubwayStation | null> {
    try {
      const result = await this.database.query(sql, [id]);
      return result;

    } catch (originalError) {
      // 일반 에러를 Repository 에러로 자동 변환
      throw mapToRepositoryError(
        originalError,
        'SubwayStationRepository',
        'findById',
        { searchId: id }
      );
    }
  }
}
```

### 🎭 도메인별 전용 에러 클래스

**SubwayStationError**
```typescript
export class SubwayStationService {
  async validateSearchArea(lat: number, lng: number, radius: number) {
    // 좌표 검증
    if (lat < 33.0 || lat > 38.6) {
      throw SubwayStationError.invalidCoordinates(lat, lng);
    }

    // 검색 반경 검증
    if (radius > 10000) {
      throw SubwayStationError.invalidSearchRadius(radius);
    }
  }
}

// 사용법
try {
  await stationService.validateSearchArea(91.0, 127.0, 1000);
} catch (error) {
  if (error instanceof SubwayStationError) {
    console.log(`지하철역 검색 오류: ${error.message}`);
    console.log(`Repository: ${error.repositoryName}`);
    console.log(`Operation: ${error.operation}`);
  }
}
```

**MeetingPointError**
```typescript
export class MeetingPointService {
  async validateMeetingRequest(participants: ParticipantLocation[]) {
    // 참가자 수 검증
    if (participants.length > 10) {
      throw MeetingPointError.tooManyParticipants(participants.length, 10);
    }

    // 각 참가자 정보 검증
    for (const participant of participants) {
      if (!participant.lat || !participant.lng) {
        throw MeetingPointError.invalidParticipant(
          participant.name,
          '위치 정보가 누락되었습니다'
        );
      }
    }
  }
}
```

**NaverApiError**
```typescript
export class NaverApiService {
  async getCachedResult(key: string): Promise<CacheResult> {
    try {
      const cached = await this.repository.getCache(key);

      if (!cached) {
        throw NaverApiError.cacheExpired('reverseGeocode', key);
      }

      return cached;

    } catch (error) {
      if (error.name === 'InvalidKeyFormat') {
        throw NaverApiError.invalidCacheKey('reverseGeocode', key);
      }
      throw error;
    }
  }
}
```

---

## 에러 처리 워크플로우

### 🔄 계층간 에러 전파 흐름

**Repository → Service → Controller → Error Handler**

```typescript
// 1️⃣ Repository Layer: 데이터 접근 에러
export class SubwayStationRepository {
  async findById(id: string): Promise<SubwayStation | null> {
    const station = await this.dataSource.findOne({ code: id });

    if (!station) {
      // Repository 계층에서 구체적인 에러 생성
      throw new EntityNotFoundError('SubwayStation', id, 'SubwayStationRepository');
    }

    return station;
  }
}

// 2️⃣ Service Layer: 비즈니스 로직 및 에러 변환
export class SubwayStationService {
  async getStationById(id: string): Promise<SubwayStation> {
    try {
      const station = await this.repository.findById(id);
      return station;

    } catch (error) {
      // Repository 에러를 사용자 친화적 메시지로 변환
      if (isEntityNotFoundError(error)) {
        throw new AppError(
          `요청하신 지하철역을 찾을 수 없습니다. (역코드: ${id})`,
          404,
          'STATION_NOT_FOUND',
          true,
          { stationId: id }
        );
      }

      // 예상치 못한 에러는 그대로 전파
      throw error;
    }
  }
}

// 3️⃣ Controller Layer: HTTP 인터페이스
export const getStation = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Service에서 발생한 에러는 asyncHandler가 자동으로 next(error)로 전달
  const station = await stationService.getStationById(id);

  res.json({
    success: true,
    data: station,
    timestamp: new Date().toISOString()
  });
});

// 4️⃣ Error Handler Middleware: 최종 에러 처리
export const errorHandler = (error: Error, req: Request, res: Response, _next: NextFunction) => {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = '서버 내부 오류가 발생했습니다';

  // Repository 에러 처리
  if (isRepositoryError(error)) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;

    // 특정 Repository 에러 타입별 사용자 메시지 조정
    if (error instanceof DatabaseConnectionError) {
      message = '일시적으로 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.';
    }
  }
  // AppError 처리
  else if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
  }

  // 최종 응답
  res.status(statusCode).json({
    success: false,
    error: code,
    message,
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'],
    ...(process.env.NODE_ENV === 'development' && {
      details: error.details,
      stack: error.stack
    })
  });
};
```

### 🚨 에러 복구 전략

**1. 자동 재시도**
```typescript
export class ResilientNaverApiRepository {
  async reverseGeocode(coordinates: Point, retries = 3): Promise<ReverseGeocodeResult> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.performReverseGeocode(coordinates);

      } catch (error) {
        // 네트워크 에러인 경우 재시도
        if (error instanceof NetworkError && attempt < retries) {
          await this.delay(Math.pow(2, attempt) * 1000); // 지수 백오프
          continue;
        }

        // 최종 실패
        throw new QueryExecutionError(
          'NaverApiRepository',
          'reverseGeocode',
          undefined,
          error,
          { coordinates, attempts: attempt }
        );
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**2. 대체 데이터 소스**
```typescript
export class FallbackMeetingPointRepository {
  constructor(
    private primary: IMeetingPointRepository,
    private fallback: IMeetingPointRepository
  ) {}

  async findById(id: string): Promise<MeetingSession | null> {
    try {
      // 주 데이터 소스 시도
      return await this.primary.findById(id);

    } catch (error) {
      if (error instanceof DatabaseConnectionError) {
        try {
          // 대체 데이터 소스 사용
          return await this.fallback.findById(id);

        } catch (fallbackError) {
          // 양쪽 모두 실패 시 원본 에러와 함께 보고
          throw new QueryExecutionError(
            'FallbackMeetingPointRepository',
            'findById',
            undefined,
            error,
            { fallbackError: fallbackError.message }
          );
        }
      }

      throw error;
    }
  }
}
```

**3. 부분적 성공 처리**
```typescript
export class BatchSubwayStationService {
  async getStationsByIds(ids: string[]): Promise<{
    stations: SubwayStation[];
    errors: Array<{ id: string; error: string }>;
  }> {
    const stations: SubwayStation[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    // 각 ID별로 개별 처리
    for (const id of ids) {
      try {
        const station = await this.repository.findById(id);
        if (station) stations.push(station);

      } catch (error) {
        errors.push({
          id,
          error: error instanceof EntityNotFoundError
            ? '역을 찾을 수 없습니다'
            : '조회 중 오류가 발생했습니다'
        });
      }
    }

    // 부분적 성공도 유용한 결과로 반환
    return { stations, errors };
  }
}
```

---

## 실전 예제 모음

### 🎯 시나리오 1: 지하철역 검색 실패 처리

```typescript
export class StationSearchController {
  static searchNearbyStations = asyncHandler(async (req: Request, res: Response) => {
    const { lat, lng, radius = 1000, limit = 10 } = req.body;

    try {
      // 1단계: 입력 검증
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        throw new AppError('위도와 경도는 숫자여야 합니다', 400, 'INVALID_COORDINATES');
      }

      // 2단계: 비즈니스 로직 실행
      const stations = await stationService.searchNearbyStations({
        center: { lat, lng },
        radius,
        limit
      });

      // 3단계: 성공 응답
      res.json({
        success: true,
        data: {
          stations,
          searchCenter: { lat, lng },
          searchRadius: radius,
          resultCount: stations.length
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      // asyncHandler가 자동으로 errorHandler로 전달
      throw error;
    }
  });
}

// Service 계층에서의 세밀한 에러 처리
export class StationService {
  async searchNearbyStations(params: SearchParams): Promise<SubwayStation[]> {
    try {
      // 좌표 유효성 검증
      this.validateCoordinates(params.center.lat, params.center.lng);

      // 검색 반경 검증
      if (params.radius > 10000) {
        throw new AppError(
          '검색 반경은 10km를 초과할 수 없습니다',
          400,
          'SEARCH_RADIUS_TOO_LARGE',
          true,
          { maxRadius: 10000, requestedRadius: params.radius }
        );
      }

      // Repository를 통한 데이터 조회
      const stations = await this.repository.findNearby(
        params.center,
        params.radius,
        params.limit
      );

      // 빈 결과 처리
      if (stations.length === 0) {
        throw new AppError(
          '검색 범위 내에 지하철역이 없습니다. 검색 반경을 늘려보세요.',
          404,
          'NO_STATIONS_FOUND',
          true,
          { searchParams: params }
        );
      }

      return stations;

    } catch (error) {
      // Repository 에러를 적절히 변환
      if (isEntityValidationError(error)) {
        throw new AppError(
          '검색 조건이 올바르지 않습니다',
          400,
          'INVALID_SEARCH_PARAMS',
          true,
          { validationErrors: error.validationErrors }
        );
      }

      throw error; // 기타 에러는 그대로 전파
    }
  }
}
```

**예상 응답**:
```json
// 성공 시
{
  "success": true,
  "data": {
    "stations": [...],
    "searchCenter": { "lat": 37.5665, "lng": 126.9780 },
    "searchRadius": 1000,
    "resultCount": 5
  },
  "timestamp": "2024-03-15T10:30:00.000Z"
}

// 실패 시
{
  "success": false,
  "error": "NO_STATIONS_FOUND",
  "message": "검색 범위 내에 지하철역이 없습니다. 검색 반경을 늘려보세요.",
  "timestamp": "2024-03-15T10:30:00.000Z",
  "requestId": "req-12345"
}
```

### 🎯 시나리오 2: 캐시 실패 시 대체 동작

```typescript
export class NaverApiService {
  async reverseGeocode(lat: number, lng: number): Promise<AddressInfo> {
    const coordinates = { lat, lng };
    const startTime = Date.now();

    try {
      // 1단계: 캐시 확인
      const cached = await this.naverRepository.findCachedReverseGeocode(coordinates);

      if (cached) {
        await this.recordSuccess('reverseGeocode', 0, true); // 캐시 히트
        return this.transformCachedResult(cached);
      }

    } catch (cacheError) {
      // 캐시 에러는 로그만 남기고 계속 진행
      logger.warn('캐시 조회 실패, API 직접 호출로 전환', {
        coordinates,
        error: cacheError.message
      });
    }

    try {
      // 2단계: 실제 API 호출
      const result = await this.callNaverReverseGeocodeApi(coordinates);
      const responseTime = Date.now() - startTime;

      // 3단계: 결과 캐싱 (실패해도 무시)
      try {
        await this.naverRepository.cacheReverseGeocode({
          coordinates,
          address: result.address,
          roadAddress: result.roadAddress,
          district: result.district
        });
      } catch (cachingError) {
        // 캐싱 실패는 사용자에게 영향 없음
        logger.warn('결과 캐싱 실패', {
          coordinates,
          error: cachingError.message
        });
      }

      await this.recordSuccess('reverseGeocode', responseTime, false);
      return result;

    } catch (apiError) {
      const responseTime = Date.now() - startTime;
      await this.recordFailure('reverseGeocode', responseTime, apiError);

      // API 실패 시 의미있는 에러 메시지 제공
      if (apiError.response?.status === 429) {
        throw new AppError(
          '일일 API 호출 한도를 초과했습니다. 내일 다시 시도해주세요.',
          429,
          'API_RATE_LIMIT_EXCEEDED'
        );
      }

      if (apiError.response?.status === 401) {
        throw new AppError(
          '서비스 인증 오류입니다. 관리자에게 문의하세요.',
          500,
          'API_AUTHENTICATION_ERROR'
        );
      }

      // 기본 에러 처리
      throw new AppError(
        '주소 변환 서비스에 일시적인 문제가 발생했습니다.',
        503,
        'REVERSE_GEOCODING_FAILED',
        true,
        { coordinates, originalError: apiError.message }
      );
    }
  }

  private async recordSuccess(apiType: string, responseTime: number, fromCache: boolean) {
    await this.naverRepository.recordApiUsage({
      apiType,
      success: true,
      responseTime,
      requestData: { fromCache }
    });
  }

  private async recordFailure(apiType: string, responseTime: number, error: any) {
    await this.naverRepository.recordApiUsage({
      apiType,
      success: false,
      responseTime,
      errorCode: error.code || 'UNKNOWN_ERROR',
      requestData: { errorMessage: error.message }
    });
  }
}
```

### 🎯 시나리오 3: 트랜잭션 롤백 및 복구

```typescript
export class MeetingSessionService {
  async createMeetingSession(request: MeetingPointRequest): Promise<MeetingSession> {
    const sessionId = this.generateSessionId();

    try {
      // 1단계: 입력 검증
      await this.validateRequest(request);

      // 2단계: 중간지점 계산
      const center = await this.calculateCenter(request.participants);

      // 3단계: 주변 지하철역 검색
      const nearbyStations = await this.findNearbyStations(center, request.options);

      // 4단계: 통계 계산
      const stats = this.calculateStatistics(center, request.participants);

      // 5단계: 세션 저장
      const session = await this.meetingRepository.create({
        id: sessionId,
        name: request.name,
        participants: request.participants,
        calculatedCenter: center,
        nearbyStations,
        stats
      });

      return session;

    } catch (error) {
      // 실패 시 생성된 리소스 정리
      await this.cleanup(sessionId, error);

      // 에러 타입별 사용자 친화적 메시지 제공
      if (error instanceof EntityValidationError) {
        throw new AppError(
          '입력하신 정보에 오류가 있습니다. 다시 확인해주세요.',
          400,
          'INVALID_SESSION_DATA',
          true,
          { validationErrors: error.validationErrors }
        );
      }

      if (error instanceof SubwayStationError) {
        throw new AppError(
          '중간지점 주변에 지하철역이 없습니다. 다른 위치를 시도해주세요.',
          404,
          'NO_NEARBY_STATIONS'
        );
      }

      // 예상치 못한 에러
      throw new AppError(
        '회의 세션 생성 중 오류가 발생했습니다.',
        500,
        'SESSION_CREATION_FAILED',
        false, // 운영 에러로 분류
        { sessionId, originalError: error.message }
      );
    }
  }

  private async cleanup(sessionId: string, error: Error): Promise<void> {
    try {
      // 부분적으로 생성된 세션 정보 삭제
      await this.meetingRepository.delete(sessionId);

      logger.info('Failed session cleanup completed', {
        sessionId,
        errorType: error.constructor.name,
        errorMessage: error.message
      });

    } catch (cleanupError) {
      // 정리 작업 실패는 로그만 남김
      logger.error('Session cleanup failed', {
        sessionId,
        originalError: error.message,
        cleanupError: cleanupError.message
      });
    }
  }
}
```

---

## 모범 사례 및 안티패턴

### ✅ 모범 사례 (Best Practices)

**1. 명확한 에러 메시지**
```typescript
// ❌ 나쁜 예
throw new Error('Invalid data');

// ✅ 좋은 예
throw new EntityValidationError(
  'MeetingSession',
  [
    {
      field: 'participants',
      message: '참가자는 최소 2명, 최대 10명이어야 합니다',
      value: participants.length
    }
  ],
  'MeetingPointRepository',
  'create'
);
```

**2. 에러 타입별 적절한 처리**
```typescript
// ✅ 좋은 예: 에러 타입별 차별화된 처리
export class MeetingPointController {
  static calculateMeetingPoint = asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = await meetingService.calculateMeetingPoint(req.body);
      res.json({ success: true, data: result });

    } catch (error) {
      // 구체적인 에러 타입별 처리
      if (isEntityValidationError(error)) {
        // 사용자 입력 오류 - 상세 정보 제공
        throw new AppError(
          '입력 정보를 확인해주세요',
          400,
          'VALIDATION_FAILED',
          true,
          { validationErrors: error.validationErrors }
        );
      }

      if (error instanceof SubwayStationError) {
        // 지하철역 관련 오류 - 대안 제시
        throw new AppError(
          '중간지점 주변에 지하철역이 없습니다. 검색 반경을 늘려보세요.',
          404,
          'NO_STATIONS_FOUND'
        );
      }

      // 기타 에러는 전파
      throw error;
    }
  });
}
```

**3. 로깅을 통한 디버깅 정보 제공**
```typescript
// ✅ 좋은 예: 단계별 로깅
export class NaverApiService {
  async reverseGeocode(coordinates: Point): Promise<AddressInfo> {
    logger.info('역지오코딩 시작', { coordinates });

    try {
      const result = await this.performReverseGeocode(coordinates);

      logger.info('역지오코딩 성공', {
        coordinates,
        resultAddress: result.address,
        responseTime: result.responseTime
      });

      return result;

    } catch (error) {
      logger.error('역지오코딩 실패', {
        coordinates,
        errorType: error.constructor.name,
        errorMessage: error.message,
        stack: error.stack
      });

      throw error;
    }
  }
}
```

### ❌ 안티패턴 (Anti-Patterns)

**1. 에러 정보 숨기기**
```typescript
// ❌ 나쁜 예: 모든 에러를 일반적인 메시지로 변환
catch (error) {
  throw new Error('Something went wrong');
}

// ✅ 좋은 예: 적절한 수준의 정보 제공
catch (error) {
  if (error instanceof EntityNotFoundError) {
    throw new AppError(
      `요청하신 지하철역을 찾을 수 없습니다 (코드: ${error.details.identifier})`,
      404,
      'STATION_NOT_FOUND',
      true,
      { stationCode: error.details.identifier }
    );
  }
  throw error;
}
```

**2. 에러 무시하기**
```typescript
// ❌ 나쁜 예: 에러를 catch하고 무시
try {
  await this.cacheResult(data);
} catch {
  // 에러 무시 - 사일런트 실패
}

// ✅ 좋은 예: 에러를 로그하고 적절히 처리
try {
  await this.cacheResult(data);
} catch (cacheError) {
  logger.warn('캐싱 실패, 서비스는 정상 동작', {
    data: data.id,
    error: cacheError.message
  });
  // 캐싱 실패는 서비스 동작에 영향 없음
}
```

**3. 과도한 try-catch**
```typescript
// ❌ 나쁜 예: 모든 라인을 try-catch로 감싸기
try {
  const user = await this.getUser(id);
} catch (error) {
  throw error;
}

try {
  const preferences = await this.getPreferences(user.id);
} catch (error) {
  throw error;
}

// ✅ 좋은 예: 의미있는 단위로 묶어서 처리
try {
  const user = await this.getUser(id);
  const preferences = await this.getPreferences(user.id);
  const recommendations = await this.generateRecommendations(user, preferences);

  return recommendations;

} catch (error) {
  // 전체 워크플로우 실패에 대한 의미있는 처리
  throw new AppError(
    '추천 생성 중 오류가 발생했습니다',
    500,
    'RECOMMENDATION_FAILED',
    false,
    { userId: id, step: this.identifyFailedStep(error) }
  );
}
```

---

## 모니터링 및 로깅

### 📊 에러 메트릭 수집

```typescript
export class ErrorMetricsCollector {
  private errorCounts = new Map<string, number>();
  private errorRates = new Map<string, number[]>();

  recordError(error: Error, context: any) {
    const errorType = error.constructor.name;
    const errorCode = (error as any).code || 'UNKNOWN';

    // 에러 발생 횟수
    this.errorCounts.set(errorType, (this.errorCounts.get(errorType) || 0) + 1);

    // 시간별 에러율 추적
    const currentHour = Math.floor(Date.now() / (1000 * 60 * 60));
    const hourlyErrors = this.errorRates.get(errorType) || [];
    hourlyErrors.push(currentHour);
    this.errorRates.set(errorType, hourlyErrors.slice(-24)); // 최근 24시간만 보관

    // 메트릭 전송 (Prometheus, DataDog 등)
    this.sendMetric('error.count', 1, {
      error_type: errorType,
      error_code: errorCode,
      repository: context.repository,
      operation: context.operation
    });
  }

  getErrorStats(): ErrorStats {
    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0),
      errorsByType: Object.fromEntries(this.errorCounts),
      errorTrends: this.calculateTrends(),
      topErrors: this.getTopErrors(10)
    };
  }
}
```

### 🔍 구조화된 로깅

```typescript
export class StructuredLogger {
  error(error: Error, context: LogContext) {
    const logEntry = {
      level: 'error',
      timestamp: new Date().toISOString(),
      message: error.message,
      error: {
        name: error.name,
        code: (error as any).code,
        stack: error.stack,
        isOperational: (error as any).isOperational
      },
      context: {
        requestId: context.requestId,
        userId: context.userId,
        operation: context.operation,
        repository: context.repository,
        metadata: context.metadata
      },
      environment: process.env.NODE_ENV,
      service: 'meet-here-api',
      version: process.env.APP_VERSION
    };

    // 구조화된 JSON 로그 출력
    console.error(JSON.stringify(logEntry));

    // 외부 로깅 서비스로 전송 (ELK, Splunk 등)
    this.sendToExternalLogger(logEntry);

    // 심각한 에러는 알림 발송
    if (!error.isOperational) {
      this.sendAlert(error, context);
    }
  }
}
```

### 📈 대시보드 및 알림

```typescript
export class ErrorAlertManager {
  async checkErrorThresholds() {
    const stats = await this.getHourlyErrorStats();

    // 에러율이 임계값을 초과하는 경우
    if (stats.errorRate > 0.05) { // 5% 초과
      await this.sendAlert({
        type: 'HIGH_ERROR_RATE',
        message: `에러율이 ${(stats.errorRate * 100).toFixed(2)}%로 임계값을 초과했습니다`,
        details: {
          currentRate: stats.errorRate,
          threshold: 0.05,
          timeWindow: '1 hour',
          topErrors: stats.topErrors
        }
      });
    }

    // 특정 Repository에서 연속 실패
    const repositoryErrors = await this.getRepositoryErrorCounts();
    for (const [repo, count] of repositoryErrors.entries()) {
      if (count > 100) { // 1시간에 100회 초과
        await this.sendAlert({
          type: 'REPOSITORY_DEGRADATION',
          message: `${repo}에서 높은 에러 발생률 감지`,
          details: {
            repository: repo,
            errorCount: count,
            timeWindow: '1 hour'
          }
        });
      }
    }
  }
}
```

---

이 종합적인 에러 처리 가이드를 통해 안정적이고 사용자 친화적인 API를 구축할 수 있습니다. 각 계층의 책임을 명확히 하고, 타입 안전한 에러 처리를 통해 런타임 오류를 최소화하며, 적절한 모니터링을 통해 시스템의 건강성을 지속적으로 관리할 수 있습니다. 🚀