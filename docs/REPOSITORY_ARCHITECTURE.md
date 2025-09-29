# Repository 패턴 아키텍처 가이드

## 📖 목차

1. [개요](#개요)
2. [아키텍처 설계](#아키텍처-설계)
3. [Repository 구현체](#repository-구현체)
4. [에러 처리 시스템](#에러-처리-시스템)
5. [사용법 및 예제](#사용법-및-예제)
6. [확장 가이드](#확장-가이드)

---

## 개요

MeetHere API에서는 **Repository 패턴**을 사용하여 데이터 접근 계층을 추상화하고, 비즈니스 로직과 데이터 저장 방식을 분리했습니다.

### 🎯 도입 목적

- **관심사 분리**: 데이터 접근 로직과 비즈니스 로직 분리
- **테스트 용이성**: 의존성 주입을 통한 모킹 가능
- **확장성**: 다양한 데이터 소스 지원 (In-Memory, Database, External API)
- **타입 안전성**: TypeScript 인터페이스를 통한 컴파일 시점 검증

### 🏗️ 아키텍처 장점

```
┌─────────────────┐    ┌──────────────────┐    ┌───────────────────┐
│   Controller    │───▶│    Service       │───▶│   Repository      │
│                 │    │                  │    │   Interface       │
│ - HTTP 처리     │    │ - 비즈니스 로직  │    │ - 데이터 추상화   │
│ - 요청 검증     │    │ - 조합/변환      │    │ - CRUD 작업       │
└─────────────────┘    └──────────────────┘    └───────────────────┘
                                                         │
                                   ┌─────────────────────┼─────────────────────┐
                                   │                     │                     │
                            ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
                            │  InMemory Impl  │  │ Database Impl   │  │ External API    │
                            │                 │  │                 │  │ Impl            │
                            │ - 메모리 저장   │  │ - PostgreSQL    │  │ - REST API      │
                            │ - 빠른 접근     │  │ - ORM 통합      │  │ - 캐싱          │
                            └─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 아키텍처 설계

### 📁 디렉토리 구조

```
src/
├── repositories/
│   ├── base.repository.ts           # 기본 Repository 인터페이스
│   ├── subway-station.repository.ts # 지하철역 Repository
│   ├── meeting-point.repository.ts  # 회의 세션 Repository
│   ├── naver-api.repository.ts      # 네이버 API 캐시 Repository
│   └── index.ts                     # Repository Factory 및 통합 관리
├── errors/
│   ├── repository.errors.ts         # Repository 전용 에러 클래스
│   └── index.ts                     # 에러 처리 통합 인덱스
└── types/
    └── subway.ts                    # 도메인 타입 정의
```

### 🔗 계층 관계

```typescript
// 1. 기본 인터페이스 정의
interface BaseRepository<T, K = string> {
  findById(id: K): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: K, data: Partial<T>): Promise<T>;
  delete(id: K): Promise<void>;
}

// 2. 도메인별 확장 인터페이스
interface ISubwayStationRepository extends BaseRepository<SubwayStation> {
  findByName(name: string): Promise<SubwayStation[]>;
  findNearby(center: Point, radius: number): Promise<SubwayStation[]>;
  // ... 도메인 특화 메소드
}

// 3. 구체적인 구현체
class InMemorySubwayStationRepository implements ISubwayStationRepository {
  // 실제 데이터 접근 로직 구현
}
```

---

## Repository 구현체

### 1. 📍 SubwayStation Repository

**목적**: 지하철역 데이터 관리 및 위치 기반 검색

**주요 기능**:
- 역명/호선별 검색
- 거리 기반 근접 역 조회
- 환승역 탐색
- 페이지네이션 지원

**특화 메소드**:
```typescript
interface ISubwayStationRepository {
  // 기본 CRUD (BaseRepository에서 상속)

  // 도메인 특화 메소드
  findByName(name: string): Promise<SubwayStation[]>;
  findByLine(line: string): Promise<SubwayStation[]>;
  findNearby(center: Point, radius: number, limit?: number): Promise<SubwayStation[]>;
  search(options: StationSearchOptions): Promise<SubwayStation[]>;
  findTransferStations(stationName: string): Promise<SubwayStation[]>;
  findWithinBounds(bounds: { northeast: Point; southwest: Point }): Promise<SubwayStation[]>;
  findAllLines(): Promise<string[]>;
}
```

**사용 예제**:
```typescript
const stationRepo = getSubwayStationRepository();

// 강남역 검색
const stations = await stationRepo.findByName('강남');

// 1km 반경 내 지하철역 검색
const nearby = await stationRepo.findNearby(
  { lat: 37.4979, lng: 127.0276 },
  1000,
  5
);
```

### 2. 🤝 MeetingPoint Repository

**목적**: 회의 세션 데이터 관리 및 만료 처리

**주요 기능**:
- 회의 세션 생성/조회/수정/삭제
- 자동 만료 시스템
- 지역별/참가자별 검색
- 활성 세션 통계

**데이터 모델**:
```typescript
interface MeetingSession {
  id: string;
  name?: string;
  participants: ParticipantLocation[];
  calculatedCenter: MeetingCenter;
  nearbyStations: any[];
  stats: {
    averageDistance: number;
    maxDistance: number;
    minDistance: number;
  };
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}
```

**특화 기능**:
```typescript
interface IMeetingPointRepository {
  // 기본 CRUD + 도메인 특화 메소드
  findByParticipant(participantName: string): Promise<MeetingSession[]>;
  findByRegion(bounds: { northeast: Point; southwest: Point }): Promise<MeetingSession[]>;
  cleanExpiredSessions(): Promise<number>;
  extendSession(id: string, extendHours: number): Promise<MeetingSession>;
  getActiveSessionStats(): Promise<SessionStats>;
}
```

### 3. 🌐 Naver API Repository

**목적**: 네이버 API 캐싱 시스템 및 사용량 추적

**주요 기능**:
- 역지오코딩 결과 캐싱
- 검색 결과 캐싱
- API 사용량 추적
- 자동 캐시 만료 처리

**캐시 전략**:
- **역지오코딩**: 24시간 캐시
- **검색 결과**: 1시간 캐시
- **사용량 기록**: 30일 보관

**성능 최적화**:
```typescript
// 좌표 기반 캐시 키 생성 (정밀도 조정)
private generateCoordinateKey(coordinates: Point): string {
  const lat = Math.round(coordinates.lat * 10000) / 10000; // 소수점 4자리
  const lng = Math.round(coordinates.lng * 10000) / 10000;
  return `${lat},${lng}`;
}

// 캐시 히트율 추적
async getCacheStats(): Promise<{
  hitRate: number;
  totalSize: number;
  // ...
}>;
```

---

## 에러 처리 시스템

### 🚨 에러 계층 구조

```typescript
BaseAppError (기본 앱 에러)
└── RepositoryError (Repository 기본 에러)
    ├── EntityNotFoundError (엔티티 없음)
    ├── EntityConflictError (중복 데이터)
    ├── EntityValidationError (검증 실패)
    ├── DatabaseConnectionError (DB 연결 실패)
    ├── QueryExecutionError (쿼리 실행 실패)
    ├── CacheError (캐시 에러)
    └── PaginationError (페이지네이션 에러)
```

### 🎯 Repository별 전용 에러

**SubwayStationError**:
```typescript
// 역 정보 없음
SubwayStationError.stationNotFound('STATION001');

// 잘못된 좌표
SubwayStationError.invalidCoordinates(91.0, 181.0);

// 검색 반경 초과
SubwayStationError.invalidSearchRadius(50000);
```

**MeetingPointError**:
```typescript
// 세션 만료
MeetingPointError.sessionExpired('session_123', expiredDate);

// 참가자 수 초과
MeetingPointError.tooManyParticipants(15, 10);
```

### 🔧 에러 매핑 및 처리

```typescript
// 일반 에러를 Repository 에러로 자동 매핑
const repositoryError = mapToRepositoryError(
  originalError,
  'SubwayStationRepository',
  'findNearby',
  { radius: 1000, center: { lat: 37.5, lng: 127.0 } }
);

// 에러 핸들러에서 자동 처리
if (isRepositoryError(error)) {
  return {
    success: false,
    error: error.code,
    message: error.message,
    details: {
      repository: error.repositoryName,
      operation: error.operation,
      ...error.details
    }
  };
}
```

---

## 사용법 및 예제

### 🏭 Repository Factory 사용

```typescript
import { getRepositoryFactory, getSubwayStationRepository } from '@/repositories';

// Factory를 통한 Repository 접근
const factory = getRepositoryFactory();
const stationRepo = factory.getSubwayStationRepository();

// 직접 접근 (편의 함수)
const stationRepo2 = getSubwayStationRepository();

// 커스텀 구현체 주입
factory.setSubwayStationRepository(new CustomSubwayRepository());
```

### 📊 실제 사용 시나리오

**시나리오 1: 지하철역 근처 검색**
```typescript
export class MeetingPointService {
  private stationRepository: ISubwayStationRepository;

  constructor() {
    this.stationRepository = getSubwayStationRepository();
  }

  async findOptimalStations(center: Point, options: SearchOptions) {
    try {
      // Repository를 통한 데이터 접근
      const nearbyStations = await this.stationRepository.findNearby(
        center,
        options.maxDistance,
        options.maxResults
      );

      // 환승역 우선순위 적용
      const transferStations = await Promise.all(
        nearbyStations.map(station =>
          this.stationRepository.findTransferStations(station.name)
        )
      );

      return this.prioritizeTransferStations(nearbyStations, transferStations);

    } catch (error) {
      if (isEntityNotFoundError(error)) {
        throw new AppError('검색 범위에 지하철역이 없습니다', 404);
      }
      throw error; // Repository 에러는 그대로 전파
    }
  }
}
```

**시나리오 2: 캐시 활용 API 호출**
```typescript
export class NaverService {
  private naverRepository: INaverApiRepository;

  constructor() {
    this.naverRepository = getNaverApiRepository();
  }

  async reverseGeocode(lat: number, lng: number) {
    const coordinates = { lat, lng };

    // 캐시 확인
    const cached = await this.naverRepository.findCachedReverseGeocode(coordinates);
    if (cached) {
      await this.naverRepository.recordApiUsage({
        apiType: 'reverseGeocode',
        success: true,
        responseTime: 0 // 캐시 히트
      });

      return this.transformCachedResult(cached);
    }

    // API 호출 및 캐싱
    try {
      const startTime = Date.now();
      const result = await this.callNaverApi(coordinates);
      const responseTime = Date.now() - startTime;

      // 결과 캐싱
      await this.naverRepository.cacheReverseGeocode({
        coordinates,
        address: result.address,
        roadAddress: result.roadAddress,
        district: result.district
      });

      // 사용량 기록
      await this.naverRepository.recordApiUsage({
        apiType: 'reverseGeocode',
        success: true,
        responseTime
      });

      return result;

    } catch (error) {
      // 실패 기록
      await this.naverRepository.recordApiUsage({
        apiType: 'reverseGeocode',
        success: false,
        responseTime: Date.now() - startTime,
        errorCode: error.code
      });

      throw error;
    }
  }
}
```

### 🧪 테스트에서의 활용

```typescript
describe('MeetingPointService', () => {
  let service: MeetingPointService;
  let mockStationRepo: jest.Mocked<ISubwayStationRepository>;
  let mockFactory: jest.Mocked<RepositoryFactory>;

  beforeEach(() => {
    // Mock Repository 생성
    mockStationRepo = {
      findNearby: jest.fn(),
      findTransferStations: jest.fn(),
      // ... 기타 메소드
    } as jest.Mocked<ISubwayStationRepository>;

    // Mock Factory 설정
    mockFactory = {
      getSubwayStationRepository: jest.fn().mockReturnValue(mockStationRepo)
    } as jest.Mocked<RepositoryFactory>;

    // 의존성 주입
    service = new MeetingPointService(mockFactory);
  });

  test('근처 지하철역을 올바르게 검색한다', async () => {
    // Mock 설정
    mockStationRepo.findNearby.mockResolvedValue([
      { name: '강남', line: '2호선', coordinates: { lat: 37.4979, lng: 127.0276 } }
    ]);

    // 테스트 실행
    const result = await service.findOptimalStations(
      { lat: 37.5, lng: 127.0 },
      { maxDistance: 1000, maxResults: 5 }
    );

    // 검증
    expect(mockStationRepo.findNearby).toHaveBeenCalledWith(
      { lat: 37.5, lng: 127.0 },
      1000,
      5
    );
    expect(result).toHaveLength(1);
  });
});
```

---

## 확장 가이드

### 🔧 새로운 Repository 추가하기

**1단계: 인터페이스 정의**
```typescript
// src/repositories/user.repository.ts
export interface IUserRepository extends BaseRepository<User> {
  findByEmail(email: string): Promise<User | null>;
  findActiveUsers(): Promise<User[]>;
  updateLastLogin(id: string): Promise<void>;
}
```

**2단계: 구현체 작성**
```typescript
export class InMemoryUserRepository implements IUserRepository {
  private users: Map<string, User> = new Map();

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  // ... 기타 메소드 구현
}
```

**3단계: Factory에 등록**
```typescript
// src/repositories/index.ts
export class RepositoryFactory {
  private userRepository: IUserRepository;

  constructor() {
    this.userRepository = new InMemoryUserRepository();
  }

  getUserRepository(): IUserRepository {
    return this.userRepository;
  }

  setUserRepository(repository: IUserRepository): void {
    this.userRepository = repository;
  }
}

// 편의 함수 추가
export const getUserRepository = (): IUserRepository => {
  return getRepositoryFactory().getUserRepository();
};
```

### 🗄️ 데이터베이스 구현체 추가

```typescript
export class PostgreSQLSubwayStationRepository implements ISubwayStationRepository {
  constructor(private db: Database) {}

  async findById(id: string): Promise<SubwayStation | null> {
    try {
      const result = await this.db.query(
        'SELECT * FROM subway_stations WHERE code = $1',
        [id]
      );

      return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;

    } catch (error) {
      throw mapToRepositoryError(error, 'PostgreSQLSubwayStationRepository', 'findById');
    }
  }

  async findNearby(center: Point, radius: number, limit: number = 10): Promise<SubwayStation[]> {
    try {
      const result = await this.db.query(`
        SELECT *,
               ST_Distance(coordinates::geography, ST_Point($1, $2)::geography) as distance
        FROM subway_stations
        WHERE ST_DWithin(coordinates::geography, ST_Point($1, $2)::geography, $3)
        ORDER BY distance
        LIMIT $4
      `, [center.lng, center.lat, radius, limit]);

      return result.rows.map(row => ({
        ...this.mapToEntity(row),
        distance: parseFloat(row.distance)
      }));

    } catch (error) {
      throw mapToRepositoryError(error, 'PostgreSQLSubwayStationRepository', 'findNearby');
    }
  }

  private mapToEntity(row: any): SubwayStation {
    return {
      code: row.code,
      name: row.name,
      line: row.line,
      coordinates: {
        lat: parseFloat(row.latitude),
        lng: parseFloat(row.longitude)
      }
    };
  }
}
```

### 🔄 Repository 교체하기

```typescript
// 런타임에 구현체 교체
const factory = getRepositoryFactory();

if (process.env.NODE_ENV === 'production') {
  factory.setSubwayStationRepository(new PostgreSQLSubwayStationRepository(database));
  factory.setMeetingPointRepository(new RedisBasedMeetingPointRepository(redis));
} else {
  // 개발/테스트 환경에서는 In-Memory 사용
  factory.initializeSubwayStationData(mockStationData);
}
```

---

## 📊 성능 고려사항

### 메모리 사용량 최적화
- 캐시 크기 제한 및 LRU 정책
- 만료된 데이터 자동 정리
- 대용량 데이터셋에 대한 스트리밍 처리

### 쿼리 최적화
- 인덱스 활용
- N+1 쿼리 방지
- 배치 처리 지원

### 캐싱 전략
- 계층적 캐싱 (메모리 → Redis → DB)
- 캐시 무효화 정책
- 캐시 히트율 모니터링

---

## 🔍 모니터링 및 로깅

Repository 계층에서는 다음과 같은 메트릭을 추적합니다:

- 메소드별 호출 빈도 및 응답 시간
- 에러 발생률 및 타입별 분류
- 캐시 히트율 및 성능 지표
- 데이터베이스 연결 풀 상태

```typescript
// 메트릭 수집 예제
const metrics = await factory.getRepositoryStatus();
console.log('Repository 상태:', {
  subwayStation: `${metrics.subwayStation.count}개 역 정보 로드됨`,
  meetingPoint: `${metrics.meetingPoint.count}개 활성 세션`,
  naverApi: `캐시 히트율 ${metrics.naverApi.hitRate}%`
});
```

---

이 가이드를 통해 Repository 패턴의 전체적인 구조를 이해하고, 효과적으로 활용할 수 있을 것입니다. 추가 질문이나 특정 부분에 대한 자세한 설명이 필요하시면 언제든지 문의해 주세요! 🚀