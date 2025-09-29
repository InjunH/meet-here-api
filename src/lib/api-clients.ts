/**
 * @fileoverview API 클라이언트 팩토리 및 특화된 클라이언트들
 * 외부 API별로 최적화된 HTTP 클라이언트 제공
 */

import { HttpClient, createHttpClient } from './http-client.js';
import { apiConfig } from '@/config/index.js';
import { logger } from '@/utils/logger.js';

/**
 * 네이버 클라우드 플랫폼 API 클라이언트
 * Reverse Geocoding 등의 서비스 제공
 */
export class NaverCloudClient extends HttpClient {
  constructor() {
    super({
      baseURL: 'https://maps.apigw.ntruss.com',
      timeout: 10000,
      headers: {
        'x-ncp-apigw-api-key-id': apiConfig.naver.cloud.clientId || '',
        'x-ncp-apigw-api-key': apiConfig.naver.cloud.clientSecret || '',
      },
      retryAttempts: 2,
      retryDelay: 1000,
    });

    logger.info('네이버 클라우드 API 클라이언트 초기화', {
      baseURL: 'https://maps.apigw.ntruss.com',
      hasCredentials: !!(apiConfig.naver.cloud.clientId && apiConfig.naver.cloud.clientSecret)
    });
  }

  /**
   * Reverse Geocoding API 호출
   */
  async reverseGeocode(coords: string, options: {
    sourceCrs?: string;
    orders?: string;
    output?: string;
  } = {}) {
    const params = {
      request: 'coordsToaddr',
      coords,
      sourcecrs: options.sourceCrs || 'epsg:4326',
      orders: options.orders || 'admcode,legalcode,addr,roadaddr',
      output: options.output || 'json',
    };

    return this.get('/map-reversegeocode/v2/gc', { params });
  }

  /**
   * API 연결 테스트
   */
  async testConnection(): Promise<boolean> {
    try {
      // 서울역 좌표로 테스트
      await this.reverseGeocode('126.9707,37.5547');
      return true;
    } catch (error) {
      logger.error('네이버 클라우드 API 연결 테스트 실패', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}

/**
 * 네이버 개발자센터 API 클라이언트
 * Local Search 등의 서비스 제공
 */
export class NaverSearchClient extends HttpClient {
  constructor() {
    super({
      baseURL: 'https://openapi.naver.com/v1',
      timeout: 10000,
      headers: {
        'X-Naver-Client-Id': apiConfig.naver.search.clientId || '',
        'X-Naver-Client-Secret': apiConfig.naver.search.clientSecret || '',
      },
      retryAttempts: 2,
      retryDelay: 1000,
    });

    logger.info('네이버 검색 API 클라이언트 초기화', {
      baseURL: 'https://openapi.naver.com/v1',
      hasCredentials: !!(apiConfig.naver.search.clientId && apiConfig.naver.search.clientSecret)
    });
  }

  /**
   * Local Search API 호출
   */
  async searchLocal(query: string, options: {
    display?: number;
    start?: number;
    sort?: 'random' | 'comment';
  } = {}) {
    const params = {
      query,
      display: options.display || 5,
      start: options.start || 1,
      sort: options.sort || 'random',
    };

    return this.get('/search/local.json', { params });
  }

  /**
   * API 연결 테스트
   */
  async testConnection(): Promise<boolean> {
    try {
      // 간단한 검색으로 테스트
      await this.searchLocal('서울', { display: 1 });
      return true;
    } catch (error) {
      logger.error('네이버 검색 API 연결 테스트 실패', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}

/**
 * 카카오 API 클라이언트
 * 위치 검색, 주소 변환 등의 서비스 제공
 */
export class KakaoApiClient extends HttpClient {
  constructor() {
    const apiKey = apiConfig.kakao.apiKey;

    super({
      baseURL: 'https://dapi.kakao.com',
      timeout: 10000,
      headers: apiKey ? {
        'Authorization': `KakaoAK ${apiKey}`,
      } : {},
      retryAttempts: 2,
      retryDelay: 1000,
    });

    logger.info('카카오 API 클라이언트 초기화', {
      baseURL: 'https://dapi.kakao.com',
      hasCredentials: !!apiKey
    });
  }

  /**
   * 키워드로 장소 검색
   */
  async searchPlaces(query: string, options: {
    category_group_code?: string;
    x?: number;
    y?: number;
    radius?: number;
    rect?: string;
    page?: number;
    size?: number;
    sort?: 'distance' | 'accuracy';
  } = {}) {
    return this.get('/v2/local/search/keyword.json', {
      params: { query, ...options }
    });
  }

  /**
   * 좌표로 주소 변환 (Reverse Geocoding)
   */
  async coord2Address(x: number, y: number, input_coord?: string) {
    return this.get('/v2/local/geo/coord2address.json', {
      params: { x, y, input_coord: input_coord || 'WGS84' }
    });
  }

  /**
   * 주소로 좌표 변환 (Geocoding)
   */
  async address2Coord(query: string, analyze_type?: string, page?: number, size?: number) {
    return this.get('/v2/local/search/address.json', {
      params: { query, analyze_type, page, size }
    });
  }

  /**
   * API 연결 테스트
   */
  async testConnection(): Promise<boolean> {
    try {
      // 서울역으로 테스트
      await this.coord2Address(126.9707, 37.5547);
      return true;
    } catch (error) {
      logger.error('카카오 API 연결 테스트 실패', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}

/**
 * 범용 HTTP 클라이언트
 * 기본적인 HTTP 요청에 사용
 */
export class GenericHttpClient extends HttpClient {
  constructor(baseURL: string, headers: Record<string, string> = {}) {
    super({
      baseURL,
      headers,
      retryAttempts: 1,
      retryDelay: 500,
    });
  }
}

// 싱글톤 인스턴스들
export const naverCloudClient = new NaverCloudClient();
export const naverSearchClient = new NaverSearchClient();
export const kakaoApiClient = new KakaoApiClient();

// 클라이언트 헬스 체크
export async function checkApiClientsHealth(): Promise<{
  naverCloud: boolean;
  naverSearch: boolean;
  kakao: boolean;
}> {
  const results = await Promise.allSettled([
    naverCloudClient.testConnection(),
    naverSearchClient.testConnection(),
    kakaoApiClient.testConnection(),
  ]);

  return {
    naverCloud: results[0].status === 'fulfilled' ? results[0].value : false,
    naverSearch: results[1].status === 'fulfilled' ? results[1].value : false,
    kakao: results[2].status === 'fulfilled' ? results[2].value : false,
  };
}

// 클라이언트 팩토리
export const createApiClient = {
  naverCloud: () => new NaverCloudClient(),
  naverSearch: () => new NaverSearchClient(),
  kakao: () => new KakaoApiClient(),
  generic: (baseURL: string, headers?: Record<string, string>) =>
    new GenericHttpClient(baseURL, headers),
};