/**
 * @fileoverview 네이버 Local Search API 서비스
 * 주소 자동완성 및 장소 검색 기능 제공
 */

import axios, { AxiosResponse } from 'axios';
import { logger } from '@/utils/logger.js';
import { apiConfig } from '@/config/index.js';

// 네이버 Local Search API 응답 타입
interface NaverLocalSearchItem {
  title: string;          // 업체명, 기관명 (HTML 태그 포함)
  link: string;           // 네이버 상세 정보 URL
  category: string;       // 카테고리
  description: string;    // 상세 설명
  telephone: string;      // 전화번호
  address: string;        // 지번 주소
  roadAddress: string;    // 도로명 주소
  mapx: string;          // X 좌표 (카텍 좌표계)
  mapy: string;          // Y 좌표 (카텍 좌표계)
}

interface NaverLocalSearchResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverLocalSearchItem[];
}

// 자동완성 결과 타입
export interface AddressSuggestion {
  id: string;
  title: string;         // 업체명/장소명 (HTML 태그 제거됨)
  address: string;       // 지번 주소
  roadAddress: string;   // 도로명 주소
  category: string;      // 카테고리
  coordinates: {
    lat: number;         // 위도 (WGS84)
    lng: number;         // 경도 (WGS84)
  };
}

// 검색 옵션 타입
export interface SearchOptions {
  display?: number;      // 검색 결과 출력 건수 (1~5, 기본 5)
  start?: number;        // 검색 시작 위치 (1~1000, 기본 1)
  sort?: 'random' | 'comment';  // 정렬 옵션 (random: 정확도순, comment: 평점순)
}

export class NaverSearchService {
  private readonly baseUrl = 'https://openapi.naver.com/v1/search/local.json';
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    this.clientId = apiConfig.naver.search.clientId;
    this.clientSecret = apiConfig.naver.search.clientSecret;

    logger.info('네이버 Local Search API 서비스 초기화', {
      clientIdConfigured: !!this.clientId,
      clientSecretConfigured: !!this.clientSecret
    });

    if (!this.clientId || !this.clientSecret) {
      logger.warn('네이버 Local Search API 인증 정보가 설정되지 않았습니다', {
        clientIdExists: !!this.clientId,
        clientSecretExists: !!this.clientSecret
      });
    }
  }

  /**
   * HTML 태그 제거 함수
   */
  private removeHtmlTags(text: string): string {
    return text.replace(/<[^>]*>/g, '');
  }

  /**
   * 카텍 좌표계를 WGS84 좌표계로 변환
   */
  private convertCoordinates(mapx: string, mapy: string): { lat: number; lng: number } {
    const lat = Number(mapy) / 10000000;
    const lng = Number(mapx) / 10000000;
    return { lat, lng };
  }

  /**
   * 네이버 Local Search API를 사용하여 주소/장소 검색
   */
  async searchLocal(
    query: string,
    options: SearchOptions = {}
  ): Promise<AddressSuggestion[]> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('네이버 Local Search API 인증 정보가 설정되지 않았습니다');
    }

    if (!query.trim()) {
      return [];
    }

    const { display = 5, start = 1, sort = 'random' } = options;

    try {
      logger.info('네이버 Local Search API 호출', {
        query,
        display,
        start,
        sort
      });

      const response: AxiosResponse<NaverLocalSearchResponse> = await axios.get(
        this.baseUrl,
        {
          headers: {
            'X-Naver-Client-Id': this.clientId,
            'X-Naver-Client-Secret': this.clientSecret,
            'User-Agent': 'MeetHere-API/1.0'
          },
          params: {
            query: query,  // axios가 자동으로 인코딩 처리
            display,
            start,
            sort
          },
          timeout: 10000 // 10초 타임아웃
        }
      );

      const data = response.data;

      logger.info('네이버 Local Search API 응답', {
        total: data.total,
        display: data.display,
        itemCount: data.items.length,
        items: data.items.slice(0, 2) // 처음 2개만 로그
      });

      // 응답 데이터를 AddressSuggestion 형태로 변환
      const suggestions: AddressSuggestion[] = data.items.map((item, index) => {
        // HTML 태그 제거
        const cleanTitle = this.removeHtmlTags(item.title);

        // 카텍 좌표계를 WGS84로 변환
        const coordinates = this.convertCoordinates(item.mapx, item.mapy);

        return {
          id: `${item.mapx}_${item.mapy}_${index}`,
          title: cleanTitle,
          address: item.address,
          roadAddress: item.roadAddress,
          category: item.category,
          coordinates
        };
      });

      // 중복 제거 (같은 좌표의 경우)
      const uniqueSuggestions = suggestions.filter((suggestion, index, array) => {
        return array.findIndex(s =>
          Math.abs(s.coordinates.lat - suggestion.coordinates.lat) < 0.0001 &&
          Math.abs(s.coordinates.lng - suggestion.coordinates.lng) < 0.0001
        ) === index;
      });

      logger.info('중복 제거 완료', {
        originalCount: suggestions.length,
        uniqueCount: uniqueSuggestions.length
      });

      return uniqueSuggestions;

    } catch (error) {
      logger.error('네이버 Local Search API 호출 실패', {
        query,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.errorMessage || error.message;

        logger.error('네이버 API 에러 상세', {
          status,
          message,
          headers: error.response?.headers
        });

        // 특정 에러에 대한 사용자 친화적 메시지
        if (status === 401) {
          throw new Error('네이버 API 인증에 실패했습니다. API 키를 확인해주세요.');
        } else if (status === 403) {
          throw new Error('네이버 API 사용 권한이 없습니다.');
        } else if (status === 429) {
          throw new Error('네이버 API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
        }

        throw new Error(`네이버 API 호출 실패: ${message}`);
      }

      throw new Error('주소 검색 중 오류가 발생했습니다');
    }
  }

  /**
   * 자동완성용 검색 (최대 5개 결과)
   */
  async getAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
    if (query.length < 2) {
      return [];
    }

    return this.searchLocal(query, {
      display: 5,
      sort: 'random'
    });
  }

  /**
   * 네이버 API 연결 상태 확인
   */
  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      // 테스트용으로 간단한 검색 수행
      await this.searchLocal('서울', { display: 1 });
      return { connected: true };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// 싱글톤 인스턴스 생성
export const naverSearchService = new NaverSearchService();