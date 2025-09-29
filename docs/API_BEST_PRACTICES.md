# API 사용법 및 모범 사례 가이드

## 📖 목차

1. [개요](#개요)
2. [Repository 패턴 활용법](#repository-패턴-활용법)
3. [Service 계층 구현 가이드](#service-계층-구현-가이드)
4. [Controller 구현 모범 사례](#controller-구현-모범-사례)
5. [테스트 작성 가이드](#테스트-작성-가이드)
6. [성능 최적화 전략](#성능-최적화-전략)
7. [실전 프로젝트 예제](#실전-프로젝트-예제)

---

## 개요

이 가이드는 MeetHere API에서 Repository 패턴과 에러 처리 시스템을 효과적으로 활용하는 방법을 제시합니다. 실제 개발 시나리오를 바탕으로 한 구체적인 예제와 함께 모범 사례를 소개합니다.

### 🎯 핵심 원칙

1. **계층별 책임 분리**: Repository ↔ Service ↔ Controller의 명확한 역할 구분
2. **타입 안전성**: TypeScript를 통한 컴파일 시점 오류 방지
3. **테스트 용이성**: 의존성 주입을 통한 격리된 테스트 환경
4. **확장 가능성**: 새로운 기능 추가 시 기존 코드 영향 최소화
5. **성능 최적화**: 캐싱, 배치 처리, 비동기 처리를 통한 효율성 극대화

---

## Repository 패턴 활용법

### 🏗️ 기본 Repository 사용 패턴

**1. Repository 가져오기**
```typescript
// 방법 1: Factory 패턴 사용
import { getRepositoryFactory } from '@/repositories';

const factory = getRepositoryFactory();
const stationRepo = factory.getSubwayStationRepository();
const meetingRepo = factory.getMeetingPointRepository();

// 방법 2: 직접 접근 (편의 함수)
import {
  getSubwayStationRepository,
  getMeetingPointRepository,
  getNaverApiRepository
} from '@/repositories';

const stationRepo = getSubwayStationRepository();
const meetingRepo = getMeetingPointRepository();
const naverRepo = getNaverApiRepository();
```

**2. 기본 CRUD 작업**
```typescript
export class SubwayStationService {
  private repository: ISubwayStationRepository;

  constructor() {
    this.repository = getSubwayStationRepository();
  }

  // 생성 (Create)
  async addStation(stationData: Omit<SubwayStation, 'id'>): Promise<SubwayStation> {
    try {
      return await this.repository.create(stationData);
    } catch (error) {
      if (isEntityConflictError(error)) {
        throw new AppError(
          '이미 존재하는 지하철역입니다',
          409,
          'STATION_ALREADY_EXISTS'
        );
      }
      throw error;
    }
  }

  // 조회 (Read)
  async getStationById(id: string): Promise<SubwayStation> {
    const station = await this.repository.findById(id);

    if (!station) {
      throw new AppError(
        '지하철역을 찾을 수 없습니다',
        404,
        'STATION_NOT_FOUND'
      );
    }

    return station;
  }

  // 수정 (Update)
  async updateStation(id: string, updates: Partial<SubwayStation>): Promise<SubwayStation> {
    return await this.repository.update(id, updates);
  }

  // 삭제 (Delete)
  async deleteStation(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
```

**3. 도메인 특화 작업**
```typescript
export class LocationService {
  private stationRepository: ISubwayStationRepository;
  private naverRepository: INaverApiRepository;

  constructor() {
    this.stationRepository = getSubwayStationRepository();
    this.naverRepository = getNaverApiRepository();
  }

  async findNearestStation(address: string): Promise<{
    station: SubwayStation;
    distance: number;
    address: string;
  }> {
    // 1단계: 주소를 좌표로 변환
    const coordinates = await this.geocodeAddress(address);

    // 2단계: 가장 가까운 지하철역 검색
    const nearbyStations = await this.stationRepository.findNearby(
      coordinates,
      2000, // 2km 반경
      1     // 가장 가까운 1개만
    );

    if (nearbyStations.length === 0) {
      throw new AppError(
        '2km 이내에 지하철역이 없습니다',
        404,
        'NO_NEARBY_STATIONS'
      );
    }

    const station = nearbyStations[0];

    return {
      station,
      distance: station.distance!,
      address
    };
  }

  private async geocodeAddress(address: string): Promise<Point> {
    // 캐시된 결과 확인
    const cacheKey = `geocode_${address}`;
    const cached = await this.naverRepository.findCachedSearchResults(cacheKey);

    if (cached && cached.results.length > 0) {
      return cached.results[0].coordinates;
    }

    // 실제 지오코딩 수행
    const results = await this.performGeocoding(address);

    if (results.length === 0) {
      throw new AppError(
        '주소를 찾을 수 없습니다',
        404,
        'ADDRESS_NOT_FOUND'
      );
    }

    // 결과 캐싱
    await this.naverRepository.cacheSearchResults({
      query: cacheKey,
      results,
      searchOptions: {}
    });

    return results[0].coordinates;
  }
}
```

### 🔄 Repository 교체 및 테스트

**개발/테스트 환경에서 Repository 교체**
```typescript
// tests/setup.ts - 테스트 환경 설정
import { getRepositoryFactory } from '@/repositories';

export function setupTestRepositories() {
  const factory = getRepositoryFactory();

  // Mock 데이터로 초기화
  factory.initializeSubwayStationData(MOCK_STATIONS);

  // 테스트용 Repository로 교체
  const mockNaverRepo = new MockNaverApiRepository();
  factory.setNaverApiRepository(mockNaverRepo);

  return { factory, mockNaverRepo };
}

// src/app.ts - 환경별 Repository 설정
function initializeRepositories() {
  const factory = getRepositoryFactory();

  if (process.env.NODE_ENV === 'production') {
    // 프로덕션: 실제 데이터베이스 사용
    factory.setSubwayStationRepository(new PostgreSQLSubwayStationRepository());
    factory.setMeetingPointRepository(new RedisBasedMeetingPointRepository());
  } else if (process.env.NODE_ENV === 'development') {
    // 개발: 실제 데이터 + 향상된 로깅
    factory.initializeSubwayStationData(loadRealStationData());
    factory.generateMockData(); // 개발용 더미 데이터
  }
  // 테스트 환경에서는 setupTestRepositories()에서 별도 설정
}
```

---

## Service 계층 구현 가이드

### 🧩 Service 클래스 구조

**기본 구조**
```typescript
export class MeetingPointService {
  private meetingRepository: IMeetingPointRepository;
  private stationRepository: ISubwayStationRepository;
  private naverRepository: INaverApiRepository;

  constructor(
    meetingRepo?: IMeetingPointRepository,
    stationRepo?: ISubwayStationRepository,
    naverRepo?: INaverApiRepository
  ) {
    // 의존성 주입 지원 (테스트에서 유용)
    this.meetingRepository = meetingRepo || getMeetingPointRepository();
    this.stationRepository = stationRepo || getSubwayStationRepository();
    this.naverRepository = naverRepo || getNaverApiRepository();
  }

  // 공개 메소드들
  public async calculateMeetingPoint(request: MeetingPointRequest): Promise<MeetingPointResponse> {
    // 구현...
  }

  // 헬퍼 메소드들 (private)
  private validateRequest(request: MeetingPointRequest): void {
    // 구현...
  }

  private calculateGeometricCenter(locations: Point[]): Point {
    // 구현...
  }
}
```

### 🔧 복잡한 비즈니스 로직 구현

**시나리오: 최적 만남 장소 추천 시스템**
```typescript
export class OptimalMeetingService extends MeetingPointService {
  async recommendOptimalLocation(request: OptimalMeetingRequest): Promise<OptimalMeetingResponse> {
    // 1단계: 입력 검증 및 전처리
    await this.validateAndPreprocess(request);

    // 2단계: 병렬로 여러 계산 수행
    const [
      geometricCenter,
      transitAccessibility,
      businessDistricts,
      weatherData
    ] = await Promise.all([
      this.calculateWeightedCenter(request.participants, request.weights),
      this.analyzeTransitAccessibility(request.participants),
      this.identifyNearbyBusinessDistricts(request.searchArea),
      this.fetchWeatherData(request.meetingDate)
    ]);

    // 3단계: 종합 점수 계산
    const candidates = await this.generateLocationCandidates(geometricCenter);
    const scoredCandidates = await this.scoreLocations(
      candidates,
      transitAccessibility,
      businessDistricts,
      weatherData,
      request.preferences
    );

    // 4단계: 최종 추천 생성
    const recommendations = this.selectTopRecommendations(scoredCandidates, 3);

    // 5단계: 결과 캐싱 및 세션 저장
    await Promise.all([
      this.cacheRecommendations(request, recommendations),
      this.saveRecommendationSession(request, recommendations)
    ]);

    return {
      recommendations,
      searchMetadata: {
        centerPoint: geometricCenter,
        searchRadius: request.searchRadius,
        criteriaWeights: request.preferences,
        calculationTime: Date.now() - startTime
      }
    };
  }

  private async validateAndPreprocess(request: OptimalMeetingRequest): Promise<void> {
    // 참가자 수 검증
    if (request.participants.length < 2 || request.participants.length > 15) {
      throw new AppError(
        '참가자는 2명 이상 15명 이하여야 합니다',
        400,
        'INVALID_PARTICIPANT_COUNT'
      );
    }

    // 각 참가자 위치 유효성 검증
    for (const participant of request.participants) {
      try {
        await this.validateParticipantLocation(participant);
      } catch (error) {
        throw new AppError(
          `${participant.name}님의 위치 정보가 올바르지 않습니다`,
          400,
          'INVALID_PARTICIPANT_LOCATION',
          true,
          { participant: participant.name, error: error.message }
        );
      }
    }

    // 만남 날짜 검증 (미래 날짜만 허용)
    if (request.meetingDate && new Date(request.meetingDate) <= new Date()) {
      throw new AppError(
        '만남 날짜는 미래 날짜여야 합니다',
        400,
        'INVALID_MEETING_DATE'
      );
    }
  }

  private async analyzeTransitAccessibility(participants: ParticipantLocation[]): Promise<TransitAnalysis> {
    const accessibilityPromises = participants.map(async participant => {
      // 각 참가자 위치에서 대중교통 접근성 분석
      const nearbyStations = await this.stationRepository.findNearby(
        { lat: participant.lat, lng: participant.lng },
        1000, // 1km 반경
        5     // 최대 5개 역
      );

      const lineAccessibility = this.calculateLineAccessibility(nearbyStations);
      const walkingTime = this.estimateWalkingTime(participant, nearbyStations);

      return {
        participant: participant.name,
        nearbyStations,
        lineAccessibility,
        walkingTime,
        accessibilityScore: this.calculateAccessibilityScore(lineAccessibility, walkingTime)
      };
    });

    const results = await Promise.all(accessibilityPromises);

    return {
      participantAccessibility: results,
      overallAccessibility: this.calculateOverallAccessibility(results),
      recommendedTransitHubs: this.identifyBestTransitHubs(results)
    };
  }

  private async scoreLocations(
    candidates: LocationCandidate[],
    transitData: TransitAnalysis,
    businessData: BusinessDistrictAnalysis,
    weatherData: WeatherData,
    preferences: UserPreferences
  ): Promise<ScoredLocation[]> {

    return candidates.map(candidate => {
      const scores = {
        // 접근성 점수 (대중교통, 도보)
        accessibility: this.calculateAccessibilityScore(candidate, transitData) * preferences.accessibilityWeight,

        // 편의시설 점수 (식당, 카페, 쇼핑 등)
        amenities: this.calculateAmenityScore(candidate, businessData) * preferences.amenityWeight,

        // 날씨 고려 점수 (실내/야외 공간 비율)
        weather: this.calculateWeatherScore(candidate, weatherData) * preferences.weatherWeight,

        // 비용 점수 (주차비, 식사비 등)
        cost: this.calculateCostScore(candidate) * preferences.costWeight,

        // 안전성 점수 (치안, 교통 안전 등)
        safety: this.calculateSafetyScore(candidate) * preferences.safetyWeight
      };

      const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);

      return {
        ...candidate,
        scores,
        totalScore,
        ranking: 0 // 나중에 정렬 후 설정
      };
    }).sort((a, b) => b.totalScore - a.totalScore)
      .map((location, index) => ({ ...location, ranking: index + 1 }));
  }
}
```

### 🎯 에러 처리 및 복구 전략

**로버스트한 Service 구현**
```typescript
export class ResilientMeetingService {
  private readonly maxRetries = 3;
  private readonly timeoutMs = 10000;

  async calculateMeetingPoint(request: MeetingPointRequest): Promise<MeetingPointResponse> {
    return await this.withRetryAndTimeout(
      () => this.performCalculation(request),
      this.maxRetries,
      this.timeoutMs
    );
  }

  private async withRetryAndTimeout<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    timeoutMs: number
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 타임아웃과 함께 작업 실행
        return await Promise.race([
          operation(),
          this.createTimeoutPromise<T>(timeoutMs)
        ]);

      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const shouldRetry = this.isRetryableError(error);

        if (isLastAttempt || !shouldRetry) {
          throw this.wrapError(error, attempt);
        }

        // 지수 백오프로 재시도 대기
        await this.delay(Math.pow(2, attempt) * 1000);

        logger.warn('중간지점 계산 재시도', {
          attempt,
          maxRetries,
          error: error.message
        });
      }
    }
  }

  private isRetryableError(error: any): boolean {
    // 네트워크 오류, 일시적 DB 연결 문제 등은 재시도 가능
    if (error instanceof DatabaseConnectionError) return true;
    if (error instanceof CacheError) return true;
    if (error.code === 'NETWORK_ERROR') return true;
    if (error.code === 'TIMEOUT_ERROR') return true;

    // 검증 오류, 비즈니스 로직 오류는 재시도 불가능
    if (error instanceof EntityValidationError) return false;
    if (error instanceof AppError && error.statusCode < 500) return false;

    return false;
  }

  private async performCalculationWithFallback(request: MeetingPointRequest): Promise<MeetingPointResponse> {
    try {
      // 기본 계산 방식
      return await this.performExactCalculation(request);

    } catch (error) {
      if (error instanceof DatabaseConnectionError) {
        // DB 연결 실패 시 캐시된 데이터 사용
        logger.warn('DB 연결 실패, 캐시 데이터로 대체 계산 수행', {
          participants: request.participants.length
        });

        return await this.performCacheBasedCalculation(request);
      }

      if (error instanceof SubwayStationError) {
        // 지하철역 데이터 오류 시 간단한 기하학적 중심만 계산
        logger.warn('지하철역 데이터 오류, 기본 계산으로 대체', {
          error: error.message
        });

        return await this.performBasicCalculation(request);
      }

      throw error;
    }
  }

  private async performCacheBasedCalculation(request: MeetingPointRequest): Promise<MeetingPointResponse> {
    // 캐시에서 유사한 요청의 결과 찾기
    const similarRequests = await this.findSimilarCachedRequests(request);

    if (similarRequests.length > 0) {
      const bestMatch = similarRequests[0];
      const adjustedResult = this.adjustCachedResult(bestMatch, request);

      return {
        ...adjustedResult,
        metadata: {
          calculationMethod: 'cache_based',
          fallbackReason: 'database_unavailable',
          accuracy: 'approximate'
        }
      };
    }

    // 캐시에도 없으면 기본 계산 수행
    return await this.performBasicCalculation(request);
  }
}
```

---

## Controller 구현 모범 사례

### 🎮 RESTful API Controller 구조

**표준 Controller 패턴**
```typescript
export class SubwayStationController {
  private service: SubwayStationService;

  constructor() {
    this.service = new SubwayStationService();
  }

  // GET /api/v1/stations
  getStations = asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 10, line, search } = req.query;

    const options: StationSearchOptions = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 100), // 최대 100개 제한
      ...(line && { lines: [line as string] }),
      ...(search && { query: search as string })
    };

    const result = await this.service.searchStations(options);

    res.json({
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasNext: result.hasNext,
        hasPrev: result.hasPrev
      },
      timestamp: new Date().toISOString()
    });
  });

  // GET /api/v1/stations/:id
  getStationById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const station = await this.service.getStationById(id);

    res.json({
      success: true,
      data: station,
      timestamp: new Date().toISOString()
    });
  });

  // POST /api/v1/stations/search/nearby
  searchNearbyStations = asyncHandler(async (req: Request, res: Response) => {
    // 요청 스키마 검증 (Zod 사용)
    const searchRequest = NearbySearchSchema.parse(req.body);

    const stations = await this.service.findNearbyStations(searchRequest);

    res.json({
      success: true,
      data: {
        stations,
        searchCenter: searchRequest.center,
        searchRadius: searchRequest.radius,
        resultCount: stations.length
      },
      timestamp: new Date().toISOString()
    });
  });

  // POST /api/v1/stations
  createStation = asyncHandler(async (req: Request, res: Response) => {
    const stationData = CreateStationSchema.parse(req.body);

    const newStation = await this.service.createStation(stationData);

    res.status(201).json({
      success: true,
      data: newStation,
      message: '지하철역이 성공적으로 등록되었습니다',
      timestamp: new Date().toISOString()
    });
  });

  // PUT /api/v1/stations/:id
  updateStation = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = UpdateStationSchema.parse(req.body);

    const updatedStation = await this.service.updateStation(id, updates);

    res.json({
      success: true,
      data: updatedStation,
      message: '지하철역 정보가 업데이트되었습니다',
      timestamp: new Date().toISOString()
    });
  });

  // DELETE /api/v1/stations/:id
  deleteStation = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    await this.service.deleteStation(id);

    res.status(204).send(); // No Content
  });
}
```

### 📋 요청 검증 스키마

**Zod를 활용한 입력 검증**
```typescript
// src/schemas/station.schemas.ts
import { z } from 'zod';

export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
});

export const NearbySearchSchema = z.object({
  center: CoordinatesSchema,
  radius: z.number().min(100).max(10000).default(1000),
  limit: z.number().min(1).max(50).default(10),
  lines: z.array(z.string()).optional(),
  includeDistance: z.boolean().default(true)
});

export const CreateStationSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(50),
  line: z.string().min(1).max(20),
  coordinates: CoordinatesSchema
});

export const UpdateStationSchema = CreateStationSchema.partial();

// 사용 예제
export const validateNearbySearch = (req: Request, res: Response, next: NextFunction) => {
  try {
    req.body = NearbySearchSchema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(
        '요청 데이터가 올바르지 않습니다',
        400,
        'VALIDATION_ERROR',
        true,
        { validationErrors: error.errors }
      );
    }
    throw error;
  }
};
```

### 🔄 미들웨어 체인

**모듈화된 미들웨어 구성**
```typescript
// src/middleware/index.ts
export const createValidationMiddleware = <T>(schema: z.ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AppError(
          '요청 형식이 올바르지 않습니다',
          400,
          'VALIDATION_ERROR',
          true,
          { errors: error.errors }
        );
      }
      throw error;
    }
  };
};

export const rateLimitMiddleware = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    // 현재 클라이언트의 요청 기록 가져오기
    const clientRequests = requests.get(clientId) || [];

    // 윈도우 시간 내의 요청만 필터링
    const recentRequests = clientRequests.filter(time => time > windowStart);

    if (recentRequests.length >= maxRequests) {
      throw new AppError(
        '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
        429,
        'RATE_LIMIT_EXCEEDED',
        true,
        {
          limit: maxRequests,
          windowMs,
          retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
        }
      );
    }

    // 현재 요청 기록
    recentRequests.push(now);
    requests.set(clientId, recentRequests);

    next();
  };
};

// 라우터에서 사용
const router = express.Router();

router.post(
  '/stations/search/nearby',
  rateLimitMiddleware(100, 60000), // 1분에 100회
  createValidationMiddleware(NearbySearchSchema),
  stationController.searchNearbyStations
);
```

---

## 테스트 작성 가이드

### 🧪 단위 테스트 (Unit Tests)

**Repository 테스트**
```typescript
// tests/unit/repositories/subway-station.repository.test.ts
describe('SubwayStationRepository', () => {
  let repository: InMemorySubwayStationRepository;
  const mockStations: SubwayStation[] = [
    {
      code: '0150',
      name: '강남',
      line: '2호선',
      coordinates: { lat: 37.4979, lng: 127.0276 }
    },
    {
      code: '0239',
      name: '홍대입구',
      line: '2호선',
      coordinates: { lat: 37.5568, lng: 126.9244 }
    }
  ];

  beforeEach(() => {
    repository = new InMemorySubwayStationRepository(mockStations);
  });

  describe('findById', () => {
    it('존재하는 ID로 조회 시 역 정보를 반환한다', async () => {
      const station = await repository.findById('0150_2호선');

      expect(station).toBeDefined();
      expect(station!.name).toBe('강남');
      expect(station!.line).toBe('2호선');
    });

    it('존재하지 않는 ID로 조회 시 null을 반환한다', async () => {
      const station = await repository.findById('nonexistent');

      expect(station).toBeNull();
    });
  });

  describe('findNearby', () => {
    it('지정된 반경 내의 지하철역을 거리순으로 반환한다', async () => {
      const center = { lat: 37.5, lng: 127.0 };
      const radius = 10000; // 10km

      const nearbyStations = await repository.findNearby(center, radius, 10);

      expect(nearbyStations.length).toBeGreaterThan(0);
      expect(nearbyStations[0].distance).toBeDefined();

      // 거리순 정렬 확인
      for (let i = 1; i < nearbyStations.length; i++) {
        expect(nearbyStations[i-1].distance!).toBeLessThanOrEqual(nearbyStations[i].distance!);
      }
    });

    it('반경 내에 역이 없으면 빈 배열을 반환한다', async () => {
      const center = { lat: 35.0, lng: 129.0 }; // 부산 지역
      const radius = 1000; // 1km

      const nearbyStations = await repository.findNearby(center, radius, 10);

      expect(nearbyStations).toEqual([]);
    });
  });
});
```

**Service 테스트**
```typescript
// tests/unit/services/meeting-point.service.test.ts
describe('MeetingPointService', () => {
  let service: MeetingPointService;
  let mockMeetingRepo: jest.Mocked<IMeetingPointRepository>;
  let mockStationRepo: jest.Mocked<ISubwayStationRepository>;
  let mockNaverRepo: jest.Mocked<INaverApiRepository>;

  beforeEach(() => {
    // Mock Repository 생성
    mockMeetingRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findAll: jest.fn()
    } as jest.Mocked<IMeetingPointRepository>;

    mockStationRepo = {
      findNearby: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    } as jest.Mocked<ISubwayStationRepository>;

    mockNaverRepo = {
      recordApiUsage: jest.fn()
    } as jest.Mocked<INaverApiRepository>;

    // 의존성 주입으로 Service 생성
    service = new MeetingPointService(mockMeetingRepo, mockStationRepo, mockNaverRepo);
  });

  describe('calculateMeetingPoint', () => {
    const validRequest: MeetingPointRequest = {
      participants: [
        { name: '김철수', lat: 37.4979, lng: 127.0276 },
        { name: '이영희', lat: 37.5568, lng: 126.9244 }
      ]
    };

    it('유효한 요청으로 중간지점을 계산한다', async () => {
      // Mock 설정
      const mockStations = [
        { name: '시청', line: '2호선', coordinates: { lat: 37.5657, lng: 126.9769 } }
      ];
      mockStationRepo.findNearby.mockResolvedValue(mockStations);

      const mockSession = {
        id: 'session_123',
        participants: validRequest.participants,
        calculatedCenter: { lat: 37.5274, lng: 126.9760 },
        nearbyStations: mockStations,
        stats: { averageDistance: 5000, maxDistance: 7000, minDistance: 3000 },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      mockMeetingRepo.create.mockResolvedValue(mockSession);

      // 테스트 실행
      const result = await service.calculateMeetingPoint(validRequest);

      // 검증
      expect(result).toBeDefined();
      expect(result.center).toBeDefined();
      expect(result.nearbyStations).toHaveLength(1);
      expect(mockStationRepo.findNearby).toHaveBeenCalledWith(
        expect.any(Object), // 계산된 중심점
        2000, // 기본 반경
        5     // 기본 결과 수
      );
      expect(mockMeetingRepo.create).toHaveBeenCalled();
    });

    it('참가자가 1명만 있으면 에러를 발생시킨다', async () => {
      const invalidRequest = {
        participants: [{ name: '김철수', lat: 37.4979, lng: 127.0276 }]
      };

      await expect(service.calculateMeetingPoint(invalidRequest))
        .rejects.toThrow('최소 1명 이상의 참가자가 필요합니다');
    });

    it('잘못된 좌표가 있으면 에러를 발생시킨다', async () => {
      const invalidRequest = {
        participants: [
          { name: '김철수', lat: 91.0, lng: 127.0276 }, // 잘못된 위도
          { name: '이영희', lat: 37.5568, lng: 126.9244 }
        ]
      };

      await expect(service.calculateMeetingPoint(invalidRequest))
        .rejects.toThrow('유효하지 않은 좌표');
    });
  });
});
```

### 🔌 통합 테스트 (Integration Tests)

**API 엔드포인트 테스트**
```typescript
// tests/integration/meeting-point.api.test.ts
describe('Meeting Point API Integration Tests', () => {
  let app: Express;
  let factory: RepositoryFactory;

  beforeAll(async () => {
    // 테스트용 앱 설정
    app = createTestApp();
    factory = getRepositoryFactory();

    // 테스트 데이터 초기화
    await setupTestData(factory);
  });

  afterEach(async () => {
    // 각 테스트 후 데이터 정리
    await cleanupTestData(factory);
  });

  describe('POST /api/v1/meeting-point/calculate', () => {
    it('유효한 요청으로 중간지점 계산 결과를 반환한다', async () => {
      const requestBody = {
        participants: [
          { name: '김철수', lat: 37.4979, lng: 127.0276 },
          { name: '이영희', lat: 37.5568, lng: 126.9244 },
          { name: '박민수', lat: 37.5665, lng: 126.9780 }
        ],
        options: {
          maxDistance: 2000,
          maxResults: 5
        }
      };

      const response = await request(app)
        .post('/api/v1/meeting-point/calculate')
        .send(requestBody)
        .expect('Content-Type', /json/)
        .expect(200);

      // 응답 구조 검증
      expect(response.body).toEqual({
        success: true,
        data: expect.objectContaining({
          center: expect.objectContaining({
            lat: expect.any(Number),
            lng: expect.any(Number)
          }),
          nearbyStations: expect.any(Array),
          participants: expect.arrayContaining([
            expect.objectContaining({
              name: expect.any(String),
              lat: expect.any(Number),
              lng: expect.any(Number)
            })
          ]),
          stats: expect.objectContaining({
            averageDistance: expect.any(Number),
            maxDistance: expect.any(Number),
            minDistance: expect.any(Number)
          })
        }),
        timestamp: expect.any(String)
      });

      // 데이터 유효성 검증
      expect(response.body.data.center.lat).toBeGreaterThan(37.0);
      expect(response.body.data.center.lat).toBeLessThan(38.0);
      expect(response.body.data.nearbyStations.length).toBeGreaterThan(0);
    });

    it('잘못된 형식의 요청에 400 에러를 반환한다', async () => {
      const invalidRequestBody = {
        participants: [
          { name: '김철수', lat: 'invalid', lng: 127.0276 }
        ]
      };

      const response = await request(app)
        .post('/api/v1/meeting-point/calculate')
        .send(invalidRequestBody)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'VALIDATION_ERROR',
        message: expect.stringContaining('요청 데이터가 올바르지 않습니다'),
        timestamp: expect.any(String),
        details: expect.any(Object)
      });
    });

    it('과도한 요청 시 429 에러를 반환한다', async () => {
      const requestBody = {
        participants: [
          { name: '김철수', lat: 37.4979, lng: 127.0276 },
          { name: '이영희', lat: 37.5568, lng: 126.9244 }
        ]
      };

      // 101번 연속 요청 (rate limit: 100/분)
      const requests = Array(101).fill(null).map(() =>
        request(app)
          .post('/api/v1/meeting-point/calculate')
          .send(requestBody)
      );

      const responses = await Promise.allSettled(requests);

      // 마지막 요청은 rate limit에 걸려야 함
      const lastResponse = responses[100];
      expect((lastResponse as PromiseFulfilledResult<any>).value.status).toBe(429);
    });
  });
});
```

### 📊 성능 테스트

```typescript
// tests/performance/repository.performance.test.ts
describe('Repository Performance Tests', () => {
  let repository: InMemorySubwayStationRepository;

  beforeAll(() => {
    // 대량의 테스트 데이터 생성 (10,000개 역)
    const largeDataset = generateMockStations(10000);
    repository = new InMemorySubwayStationRepository(largeDataset);
  });

  describe('findNearby performance', () => {
    it('10,000개 역 데이터에서 1초 이내에 검색 완료', async () => {
      const center = { lat: 37.5665, lng: 126.9780 };
      const startTime = Date.now();

      const results = await repository.findNearby(center, 5000, 10);

      const executionTime = Date.now() - startTime;

      expect(executionTime).toBeLessThan(1000); // 1초 이내
      expect(results).toHaveLength(10);

      console.log(`findNearby execution time: ${executionTime}ms`);
    });

    it('동시 요청 처리 성능 테스트', async () => {
      const center = { lat: 37.5665, lng: 126.9780 };
      const concurrentRequests = 100;

      const startTime = Date.now();

      // 100개 동시 요청
      const requests = Array(concurrentRequests).fill(null).map(() =>
        repository.findNearby(center, 2000, 5)
      );

      const results = await Promise.all(requests);

      const executionTime = Date.now() - startTime;
      const averageTime = executionTime / concurrentRequests;

      expect(results).toHaveLength(concurrentRequests);
      expect(averageTime).toBeLessThan(50); // 평균 50ms 이내

      console.log(`Concurrent requests (${concurrentRequests}): ${executionTime}ms total, ${averageTime}ms average`);
    });
  });
});
```

---

## 성능 최적화 전략

### ⚡ 캐싱 전략

**다계층 캐싱 구조**
```typescript
export class CachedSubwayStationService {
  private memoryCache = new Map<string, any>();
  private redisCache: Redis;
  private repository: ISubwayStationRepository;

  constructor() {
    this.redisCache = new Redis(process.env.REDIS_URL);
    this.repository = getSubwayStationRepository();
  }

  async findNearbyStations(center: Point, radius: number): Promise<SubwayStation[]> {
    const cacheKey = this.generateCacheKey(center, radius);

    // 1단계: 메모리 캐시 확인
    const memoryResult = this.memoryCache.get(cacheKey);
    if (memoryResult) {
      return memoryResult;
    }

    // 2단계: Redis 캐시 확인
    const redisResult = await this.redisCache.get(cacheKey);
    if (redisResult) {
      const parsed = JSON.parse(redisResult);
      this.memoryCache.set(cacheKey, parsed);
      return parsed;
    }

    // 3단계: Repository에서 조회
    const stations = await this.repository.findNearby(center, radius);

    // 결과 캐싱 (TTL 설정)
    await Promise.all([
      this.cacheInMemory(cacheKey, stations, 300), // 5분
      this.cacheInRedis(cacheKey, stations, 3600)   // 1시간
    ]);

    return stations;
  }

  private generateCacheKey(center: Point, radius: number): string {
    const roundedLat = Math.round(center.lat * 1000) / 1000;
    const roundedLng = Math.round(center.lng * 1000) / 1000;
    return `nearby:${roundedLat}:${roundedLng}:${radius}`;
  }

  private async cacheInMemory(key: string, data: any, ttlSeconds: number): Promise<void> {
    this.memoryCache.set(key, data);

    // TTL 적용
    setTimeout(() => {
      this.memoryCache.delete(key);
    }, ttlSeconds * 1000);
  }

  private async cacheInRedis(key: string, data: any, ttlSeconds: number): Promise<void> {
    await this.redisCache.setex(key, ttlSeconds, JSON.stringify(data));
  }
}
```

### 🔄 배치 처리

**대량 데이터 처리 최적화**
```typescript
export class BatchMeetingPointService {
  async processMultipleMeetingRequests(
    requests: MeetingPointRequest[]
  ): Promise<BatchProcessResult> {
    const batchSize = 10;
    const results: MeetingPointResponse[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    // 배치 단위로 처리
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map((request, batchIndex) =>
          this.processSingleRequest(request, i + batchIndex)
        )
      );

      // 결과 분류
      batchResults.forEach((result, batchIndex) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          errors.push({
            index: i + batchIndex,
            error: result.reason.message
          });
        }
      });

      // 과부하 방지를 위한 딜레이
      if (i + batchSize < requests.length) {
        await this.delay(100);
      }
    }

    return {
      totalProcessed: requests.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  private async processSingleRequest(
    request: MeetingPointRequest,
    index: number
  ): Promise<MeetingPointResponse> {
    try {
      return await this.calculateMeetingPoint(request);
    } catch (error) {
      throw new Error(`Request ${index}: ${error.message}`);
    }
  }
}
```

### 🚀 비동기 최적화

**병렬 처리 극대화**
```typescript
export class OptimizedMeetingService {
  async calculateOptimalMeetingPoint(request: MeetingPointRequest): Promise<MeetingPointResponse> {
    // 1단계: 입력 검증 (동기)
    this.validateRequest(request);

    // 2단계: 병렬로 독립적인 작업들 수행
    const [
      geometricCenter,
      boundingBox,
      participantStats
    ] = await Promise.all([
      this.calculateCenter(request.participants),
      this.calculateBoundingBox(request.participants),
      this.analyzeParticipants(request.participants)
    ]);

    // 3단계: 이전 결과를 바탕으로 병렬 작업
    const [
      nearbyStations,
      businessDistricts,
      transportationHubs
    ] = await Promise.all([
      this.findNearbyStations(geometricCenter, request.options),
      this.findBusinessDistricts(boundingBox),
      this.findTransportationHubs(geometricCenter, 3000)
    ]);

    // 4단계: 최종 결과 조합 및 캐싱
    const [
      finalResult,
      cacheOperation
    ] = await Promise.all([
      this.compileResults(geometricCenter, nearbyStations, participantStats),
      this.cacheCalculationResult(request, geometricCenter, nearbyStations)
    ]);

    return finalResult;
  }

  private async analyzeParticipants(participants: ParticipantLocation[]): Promise<ParticipantAnalysis> {
    // 각 참가자별 개별 분석을 병렬로 수행
    const analyses = await Promise.all(
      participants.map(async participant => ({
        name: participant.name,
        nearbyStations: await this.findNearbyStations(participant, { maxResults: 3 }),
        accessibilityScore: await this.calculateAccessibilityScore(participant),
        transitOptions: await this.getTransitOptions(participant)
      }))
    );

    return {
      participants: analyses,
      diversity: this.calculateLocationDiversity(participants),
      centeroid: this.calculateCenteroid(participants)
    };
  }
}
```

---

## 실전 프로젝트 예제

### 🎯 완전한 기능 구현 예제

**사용자 그룹 기반 정기 모임 장소 추천 시스템**

```typescript
// src/services/group-meeting.service.ts
export class GroupMeetingService {
  private meetingRepo: IMeetingPointRepository;
  private stationRepo: ISubwayStationRepository;
  private naverRepo: INaverApiRepository;

  constructor() {
    this.meetingRepo = getMeetingPointRepository();
    this.stationRepo = getSubwayStationRepository();
    this.naverRepo = getNaverApiRepository();
  }

  async createRecurringMeetingGroup(request: CreateGroupRequest): Promise<MeetingGroup> {
    // 1단계: 그룹 정보 검증
    await this.validateGroupRequest(request);

    // 2단계: 각 멤버의 선호 위치 분석
    const memberPreferences = await this.analyzeMemberPreferences(request.members);

    // 3단계: 최적 만남 지역 계산
    const optimalRegions = await this.calculateOptimalRegions(memberPreferences, request.preferences);

    // 4단계: 정기 모임 일정에 따른 장소 추천
    const scheduledMeetings = await this.generateScheduledMeetings(
      optimalRegions,
      request.schedule,
      request.meetingType
    );

    // 5단계: 그룹 생성 및 저장
    const group = await this.createGroup({
      name: request.groupName,
      members: request.members,
      optimalRegions,
      scheduledMeetings,
      preferences: request.preferences,
      schedule: request.schedule
    });

    // 6단계: 멤버들에게 알림 발송
    await this.notifyGroupMembers(group);

    return group;
  }

  private async analyzeMemberPreferences(members: GroupMember[]): Promise<MemberPreferenceAnalysis[]> {
    return await Promise.all(
      members.map(async member => {
        // 각 멤버의 과거 활동 패턴 분석
        const [
          frequentLocations,
          preferredTransportation,
          timeConstraints,
          meetingHistory
        ] = await Promise.all([
          this.getFrequentLocations(member.id),
          this.getPreferredTransportation(member.id),
          this.getTimeConstraints(member.id),
          this.getMeetingHistory(member.id)
        ]);

        return {
          member,
          frequentLocations,
          preferredTransportation,
          timeConstraints,
          meetingHistory,
          preferenceScore: this.calculatePreferenceScore(
            frequentLocations,
            preferredTransportation,
            timeConstraints
          )
        };
      })
    );
  }

  private async calculateOptimalRegions(
    memberPreferences: MemberPreferenceAnalysis[],
    groupPreferences: GroupPreferences
  ): Promise<OptimalRegion[]> {

    // 1. 모든 멤버의 접근 가능 지역 교집합 계산
    const accessibleRegions = this.findAccessibleRegions(memberPreferences);

    // 2. 각 지역별 종합 점수 계산
    const scoredRegions = await Promise.all(
      accessibleRegions.map(async region => {
        const [
          transitScore,
          amenityScore,
          costScore,
          diversityScore
        ] = await Promise.all([
          this.calculateTransitScore(region, memberPreferences),
          this.calculateAmenityScore(region, groupPreferences),
          this.calculateCostScore(region, groupPreferences),
          this.calculateDiversityScore(region, memberPreferences)
        ]);

        return {
          region,
          scores: {
            transit: transitScore,
            amenity: amenityScore,
            cost: costScore,
            diversity: diversityScore,
            total: this.calculateTotalScore([
              transitScore,
              amenityScore,
              costScore,
              diversityScore
            ], groupPreferences.weights)
          },
          nearbyStations: await this.stationRepo.findWithinBounds(region.bounds),
          recommendedVenues: await this.findRecommendedVenues(region, groupPreferences)
        };
      })
    );

    // 3. 상위 지역들 선택
    return scoredRegions
      .sort((a, b) => b.scores.total - a.scores.total)
      .slice(0, 5);
  }

  private async generateScheduledMeetings(
    regions: OptimalRegion[],
    schedule: MeetingSchedule,
    meetingType: MeetingType
  ): Promise<ScheduledMeeting[]> {

    const meetings: ScheduledMeeting[] = [];
    const regionRotation = this.createRegionRotation(regions, schedule.frequency);

    for (let i = 0; i < schedule.totalMeetings; i++) {
      const meetingDate = this.calculateMeetingDate(schedule, i);
      const selectedRegion = regionRotation[i % regionRotation.length];

      // 해당 날짜의 날씨, 교통상황 등을 고려한 최적 장소 선택
      const [
        weatherForecast,
        trafficPrediction,
        eventSchedule
      ] = await Promise.all([
        this.getWeatherForecast(meetingDate, selectedRegion),
        this.getTrafficPrediction(meetingDate, selectedRegion),
        this.getLocalEventSchedule(meetingDate, selectedRegion)
      ]);

      const optimalVenue = await this.selectOptimalVenue(
        selectedRegion,
        meetingType,
        weatherForecast,
        trafficPrediction,
        eventSchedule
      );

      meetings.push({
        id: `meeting_${i + 1}`,
        date: meetingDate,
        region: selectedRegion,
        venue: optimalVenue,
        estimatedDuration: meetingType.duration,
        alternativeVenues: selectedRegion.recommendedVenues.slice(0, 3),
        specialConsiderations: this.generateSpecialConsiderations(
          weatherForecast,
          trafficPrediction,
          eventSchedule
        )
      });
    }

    return meetings;
  }

  async updateMeetingLocation(
    groupId: string,
    meetingId: string,
    newRequirements: LocationUpdateRequest
  ): Promise<UpdatedMeeting> {

    const [
      existingGroup,
      currentMeeting
    ] = await Promise.all([
      this.getGroupById(groupId),
      this.getMeetingById(meetingId)
    ]);

    if (!existingGroup || !currentMeeting) {
      throw new AppError('그룹 또는 모임을 찾을 수 없습니다', 404, 'NOT_FOUND');
    }

    // 실시간 정보를 바탕으로 새로운 장소 추천
    const [
      realTimeTraffic,
      currentWeather,
      memberAvailability
    ] = await Promise.all([
      this.getRealTimeTraffic(currentMeeting.region),
      this.getCurrentWeather(currentMeeting.region),
      this.checkMemberAvailability(existingGroup.members, newRequirements.newTime)
    ]);

    // 업데이트된 조건을 반영한 새로운 추천 생성
    const updatedRecommendations = await this.generateUpdatedRecommendations(
      currentMeeting,
      newRequirements,
      {
        traffic: realTimeTraffic,
        weather: currentWeather,
        availability: memberAvailability
      }
    );

    // 변경 사항을 그룹 멤버들에게 알림
    await this.notifyLocationUpdate(existingGroup, currentMeeting, updatedRecommendations);

    return {
      updatedMeeting: {
        ...currentMeeting,
        venue: updatedRecommendations[0],
        alternativeVenues: updatedRecommendations.slice(1, 4),
        lastUpdated: new Date(),
        updateReason: newRequirements.reason
      },
      notificationsSent: memberAvailability.length,
      confidence: this.calculateConfidence(updatedRecommendations[0])
    };
  }
}

// src/controllers/group-meeting.controller.ts
export class GroupMeetingController {
  private service: GroupMeetingService;

  constructor() {
    this.service = new GroupMeetingService();
  }

  createGroup = asyncHandler(async (req: Request, res: Response) => {
    const request = CreateGroupSchema.parse(req.body);
    const group = await this.service.createRecurringMeetingGroup(request);

    res.status(201).json({
      success: true,
      data: group,
      message: '정기 모임 그룹이 성공적으로 생성되었습니다',
      timestamp: new Date().toISOString()
    });
  });

  updateMeetingLocation = asyncHandler(async (req: Request, res: Response) => {
    const { groupId, meetingId } = req.params;
    const updateRequest = UpdateLocationSchema.parse(req.body);

    const result = await this.service.updateMeetingLocation(
      groupId,
      meetingId,
      updateRequest
    );

    res.json({
      success: true,
      data: result,
      message: '모임 장소가 업데이트되었습니다',
      timestamp: new Date().toISOString()
    });
  });

  getGroupAnalytics = asyncHandler(async (req: Request, res: Response) => {
    const { groupId } = req.params;
    const { period = '3months' } = req.query;

    const analytics = await this.service.getGroupAnalytics(
      groupId,
      period as AnalyticsPeriod
    );

    res.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString()
    });
  });
}
```

### 📊 모니터링 및 분석 시스템

```typescript
// src/services/analytics.service.ts
export class MeetingAnalyticsService {
  private meetingRepo: IMeetingPointRepository;
  private naverRepo: INaverApiRepository;

  constructor() {
    this.meetingRepo = getMeetingPointRepository();
    this.naverRepo = getNaverApiRepository();
  }

  async generateSystemHealthReport(): Promise<SystemHealthReport> {
    const [
      repositoryHealth,
      apiUsageStats,
      performanceMetrics,
      errorRates
    ] = await Promise.all([
      this.checkRepositoryHealth(),
      this.getApiUsageStatistics(),
      this.getPerformanceMetrics(),
      this.getErrorStatistics()
    ]);

    return {
      timestamp: new Date(),
      overall: this.calculateOverallHealth([
        repositoryHealth,
        apiUsageStats,
        performanceMetrics,
        errorRates
      ]),
      details: {
        repositories: repositoryHealth,
        apiUsage: apiUsageStats,
        performance: performanceMetrics,
        errors: errorRates
      },
      recommendations: this.generateHealthRecommendations([
        repositoryHealth,
        apiUsageStats,
        performanceMetrics,
        errorRates
      ])
    };
  }

  private async checkRepositoryHealth(): Promise<RepositoryHealthMetrics> {
    const factory = getRepositoryFactory();
    const status = await factory.getRepositoryStatus();

    return {
      subwayStation: {
        status: status.subwayStation.ready ? 'healthy' : 'degraded',
        dataCount: status.subwayStation.count,
        lastUpdate: new Date(),
        responseTime: await this.measureRepositoryResponseTime('subway')
      },
      meetingPoint: {
        status: status.meetingPoint.ready ? 'healthy' : 'degraded',
        activeSessions: status.meetingPoint.count,
        lastCleanup: await this.getLastCleanupTime(),
        responseTime: await this.measureRepositoryResponseTime('meeting')
      },
      naverApi: {
        status: status.naverApi.ready ? 'healthy' : 'degraded',
        cacheHitRate: await this.calculateCacheHitRate(),
        cacheSize: status.naverApi.cacheCount,
        responseTime: await this.measureRepositoryResponseTime('naver')
      }
    };
  }

  private async getApiUsageStatistics(): Promise<ApiUsageStatistics> {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      dailyStats,
      weeklyStats,
      usageByEndpoint,
      errorsByType
    ] = await Promise.all([
      this.naverRepo.getDailyUsage(1),
      this.naverRepo.getDailyUsage(7),
      this.getUsageByEndpoint(last7Days),
      this.getErrorsByType(last7Days)
    ]);

    return {
      daily: {
        totalRequests: dailyStats[0]?.totalCalls || 0,
        successRate: dailyStats[0]?.successRate || 100,
        reverseGeocoding: dailyStats[0]?.reverseGeocodeCalls || 0,
        localSearch: dailyStats[0]?.localSearchCalls || 0
      },
      weekly: {
        totalRequests: weeklyStats.reduce((sum, day) => sum + day.totalCalls, 0),
        averageSuccessRate: weeklyStats.reduce((sum, day) => sum + day.successRate, 0) / 7,
        trends: this.calculateUsageTrends(weeklyStats)
      },
      endpoints: usageByEndpoint,
      errors: errorsByType
    };
  }
}
```

---

## 📈 결론 및 다음 단계

이 가이드를 통해 Repository 패턴과 에러 처리 시스템을 효과적으로 활용한 견고하고 확장 가능한 API를 구축할 수 있습니다.

### 🎯 핵심 성과

1. **계층별 책임 분리**: Repository ↔ Service ↔ Controller의 명확한 역할
2. **타입 안전성**: TypeScript를 통한 컴파일 시점 오류 방지
3. **테스트 용이성**: 의존성 주입을 통한 격리된 테스트 환경
4. **확장성**: 새로운 데이터 소스 추가 시 최소한의 코드 변경
5. **성능 최적화**: 캐싱, 배치 처리, 비동기 처리

### 🚀 다음 개발 단계

1. **데이터베이스 통합**: PostgreSQL/MongoDB Repository 구현
2. **실시간 기능**: WebSocket을 통한 실시간 모임 장소 업데이트
3. **마이크로서비스**: Repository별 독립 서비스 분리
4. **모니터링 강화**: Prometheus, Grafana 연동
5. **AI/ML 통합**: 사용자 패턴 기반 지능형 추천 시스템

---

이 종합적인 가이드가 여러분의 프로젝트에서 안정적이고 확장 가능한 API를 구축하는 데 도움이 되기를 바랍니다! 🎉