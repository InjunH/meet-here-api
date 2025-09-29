/**
 * @fileoverview Repository 패턴 모듈 통합 인덱스
 * 모든 Repository 인터페이스와 구현체를 중앙에서 관리하고 export
 */

// === Base Repository ===
export type {
  BaseRepository,
  PaginatedResult,
  PaginationOptions
} from './base.repository.js';

// === SubwayStation Repository ===
export type {
  ISubwayStationRepository
} from './subway-station.repository.js';

export {
  InMemorySubwayStationRepository
} from './subway-station.repository.js';

// === MeetingPoint Repository ===
export type {
  IMeetingPointRepository,
  MeetingSession
} from './meeting-point.repository.js';

export {
  InMemoryMeetingPointRepository
} from './meeting-point.repository.js';

// === Naver API Repository ===
export type {
  INaverApiRepository,
  ReverseGeocodeCache,
  SearchCache,
  ApiUsage
} from './naver-api.repository.js';

export {
  InMemoryNaverApiRepository
} from './naver-api.repository.js';

// === Repository Factory ===
import type { SubwayStation } from '@/types/subway.js';
import { InMemorySubwayStationRepository, ISubwayStationRepository } from './subway-station.repository.js';
import { InMemoryMeetingPointRepository, IMeetingPointRepository } from './meeting-point.repository.js';
import { InMemoryNaverApiRepository, INaverApiRepository } from './naver-api.repository.js';

/**
 * Repository Factory 클래스
 * 모든 Repository 인스턴스를 중앙에서 관리하고 의존성 주입을 담당
 */
export class RepositoryFactory {
  private static instance: RepositoryFactory;

  private subwayStationRepository: ISubwayStationRepository;
  private meetingPointRepository: IMeetingPointRepository;
  private naverApiRepository: INaverApiRepository;

  private constructor() {
    // 기본 In-Memory 구현체로 초기화
    this.subwayStationRepository = new InMemorySubwayStationRepository();
    this.meetingPointRepository = new InMemoryMeetingPointRepository();
    this.naverApiRepository = new InMemoryNaverApiRepository();
  }

  /**
   * 싱글톤 인스턴스 반환
   */
  public static getInstance(): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory();
    }
    return RepositoryFactory.instance;
  }

  // === Repository 인스턴스 Getters ===

  public getSubwayStationRepository(): ISubwayStationRepository {
    return this.subwayStationRepository;
  }

  public getMeetingPointRepository(): IMeetingPointRepository {
    return this.meetingPointRepository;
  }

  public getNaverApiRepository(): INaverApiRepository {
    return this.naverApiRepository;
  }

  // === Repository 인스턴스 Setters (DI 지원) ===

  public setSubwayStationRepository(repository: ISubwayStationRepository): void {
    this.subwayStationRepository = repository;
  }

  public setMeetingPointRepository(repository: IMeetingPointRepository): void {
    this.meetingPointRepository = repository;
  }

  public setNaverApiRepository(repository: INaverApiRepository): void {
    this.naverApiRepository = repository;
  }

  // === 초기화 및 설정 ===

  /**
   * 지하철역 데이터로 SubwayStation Repository 초기화
   * @param stations 지하철역 데이터 배열
   */
  public initializeSubwayStationData(stations: SubwayStation[]): void {
    this.subwayStationRepository = new InMemorySubwayStationRepository(stations);
  }

  /**
   * 모든 Repository를 커스텀 구현체로 교체
   */
  public setCustomRepositories(repositories: {
    subwayStation?: ISubwayStationRepository;
    meetingPoint?: IMeetingPointRepository;
    naverApi?: INaverApiRepository;
  }): void {
    if (repositories.subwayStation) {
      this.subwayStationRepository = repositories.subwayStation;
    }
    if (repositories.meetingPoint) {
      this.meetingPointRepository = repositories.meetingPoint;
    }
    if (repositories.naverApi) {
      this.naverApiRepository = repositories.naverApi;
    }
  }

  /**
   * 전체 Repository 상태 확인
   */
  public async getRepositoryStatus(): Promise<{
    subwayStation: { ready: boolean; count: number };
    meetingPoint: { ready: boolean; count: number };
    naverApi: { ready: boolean; cacheCount: number };
  }> {
    const subwayStationRepo = this.subwayStationRepository as InMemorySubwayStationRepository;
    const meetingPointRepo = this.meetingPointRepository as InMemoryMeetingPointRepository;
    const naverApiRepo = this.naverApiRepository as InMemoryNaverApiRepository;

    const [
      subwayStations,
      meetingPointCount,
      cacheStats
    ] = await Promise.all([
      subwayStationRepo.findAll?.() || [],
      meetingPointRepo.getSessionCount?.() || Promise.resolve(0),
      naverApiRepo.getCacheStats?.() || Promise.resolve({ totalSize: 0 })
    ]);

    return {
      subwayStation: {
        ready: subwayStations.length > 0,
        count: subwayStations.length
      },
      meetingPoint: {
        ready: true,
        count: typeof meetingPointCount === 'number' ? meetingPointCount : 0
      },
      naverApi: {
        ready: true,
        cacheCount: typeof cacheStats.totalSize === 'number' ? cacheStats.totalSize : 0
      }
    };
  }

  /**
   * 개발/테스트용 더미 데이터 생성
   */
  public async generateMockData(): Promise<void> {
    // 더미 지하철역 데이터 (서울 주요역)
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
      },
      {
        code: '0132',
        name: '서울역',
        line: '1호선',
        coordinates: { lat: 37.5547, lng: 126.9707 }
      },
      {
        code: '0426',
        name: '명동',
        line: '4호선',
        coordinates: { lat: 37.5635, lng: 126.9837 }
      }
    ];

    this.initializeSubwayStationData(mockStations);

    // 더미 회의 세션 생성
    const meetingRepo = this.meetingPointRepository;
    await meetingRepo.create({
      name: '샘플 회의',
      participants: [
        { name: '김철수', lat: 37.4979, lng: 127.0276, address: '강남역' },
        { name: '이영희', lat: 37.5568, lng: 126.9244, address: '홍대입구' }
      ],
      calculatedCenter: { lat: 37.5274, lng: 126.9760 },
      nearbyStations: [],
      stats: {
        averageDistance: 5000,
        maxDistance: 7000,
        minDistance: 3000
      }
    });
  }
}

// === 편의 함수들 ===

/**
 * Repository Factory 싱글톤 인스턴스 가져오기
 */
export const getRepositoryFactory = (): RepositoryFactory => {
  return RepositoryFactory.getInstance();
};

/**
 * 개별 Repository 인스턴스 가져오기 편의 함수들
 */
export const getSubwayStationRepository = (): ISubwayStationRepository => {
  return getRepositoryFactory().getSubwayStationRepository();
};

export const getMeetingPointRepository = (): IMeetingPointRepository => {
  return getRepositoryFactory().getMeetingPointRepository();
};

export const getNaverApiRepository = (): INaverApiRepository => {
  return getRepositoryFactory().getNaverApiRepository();
};

/**
 * 타입 가드 함수들
 */
export const isInMemorySubwayRepository = (repo: ISubwayStationRepository): repo is InMemorySubwayStationRepository => {
  return 'getStationCount' in repo;
};

export const isInMemoryMeetingRepository = (repo: IMeetingPointRepository): repo is InMemoryMeetingPointRepository => {
  return 'getSessionCount' in repo;
};

export const isInMemoryNaverRepository = (repo: INaverApiRepository): repo is InMemoryNaverApiRepository => {
  return 'getCacheStats' in repo;
};