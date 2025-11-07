/**
 * @fileoverview 장소 검색 서비스
 * 네이버 Local Search API를 활용하여 중간지점 주변 장소 추천
 */

import { logger } from '@/utils/logger.js';
import { naverSearchService } from '@/services/naver-search.service.js';
import { AppError } from '@/middleware/errorHandler.js';

// 카테고리 매핑 (우리 카테고리 -> 검색 키워드)
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  CAFE: ['카페', '커피', '디저트'],
  RESTAURANT: ['맛집', '음식점', '레스토랑'],
  BAR: ['술집', '바', '펍'],
  CULTURE: ['문화시설', '영화관', '박물관'],
  SHOPPING: ['쇼핑', '백화점', '마트']
};

// 검색 옵션
export interface PlaceSearchOptions {
  lat: number;           // 중심점 위도
  lng: number;           // 중심점 경도
  category?: string;     // 카테고리 (CAFE, RESTAURANT, BAR, CULTURE, SHOPPING)
  radius?: number;       // 검색 반경 (미터, 기본 1000m)
  limit?: number;        // 결과 개수 (기본 20개)
}

// 장소 정보
export interface PlaceInfo {
  id: string;
  kakaoPlaceId: string;
  name: string;
  category: {
    code: string;
    name: string;
  };
  address: string;
  roadAddress?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  distance: number;
  phone?: string;
  url?: string;
}

// 검색 결과
export interface PlaceSearchResult {
  places: PlaceInfo[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
  searchInfo: {
    center: {
      lat: number;
      lng: number;
    };
    radius: number;
    category?: string;
  };
}

export class PlaceSearchService {
  /**
   * 좌표 주변 장소 검색
   */
  async searchNearbyPlaces(options: PlaceSearchOptions): Promise<PlaceSearchResult> {
    const { lat, lng, category, radius = 1000, limit = 20 } = options;

    try {
      logger.info('장소 검색 시작', {
        center: { lat, lng },
        category,
        radius,
        limit
      });

      // 카테고리가 있으면 특정 카테고리로 검색, 없으면 일반 검색
      let places: PlaceInfo[] = [];
      let total = 0;
      let hasMore = false;

      if (category && CATEGORY_KEYWORDS[category]) {
        // 카테고리별 검색
        const result = await this.searchByCategory(lat, lng, category, radius, limit);
        places = result.places;
        total = result.total;
        hasMore = result.hasMore;
      } else {
        // 일반 검색 (주변 모든 장소)
        const result = await this.searchGeneral(lat, lng, radius, limit);
        places = result.places;
        total = result.total;
        hasMore = result.hasMore;
      }

      logger.info('장소 검색 완료', {
        resultCount: places.length,
        total,
        category
      });

      return {
        places,
        pagination: {
          total,
          page: 1,
          limit,
          hasMore
        },
        searchInfo: {
          center: { lat, lng },
          radius,
          category
        }
      };

    } catch (error) {
      logger.error('장소 검색 실패', {
        error: error instanceof Error ? error.message : 'Unknown error',
        options
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        '장소 검색 중 오류가 발생했습니다',
        500,
        'PLACE_SEARCH_ERROR',
        true,
        { options }
      );
    }
  }

  /**
   * 카테고리별 장소 검색 (네이버 API 사용)
   */
  private async searchByCategory(
    lat: number,
    lng: number,
    category: string,
    radius: number,
    limit: number
  ): Promise<{ places: PlaceInfo[]; total: number; hasMore: boolean }> {
    const keywords = CATEGORY_KEYWORDS[category] || [category];

    logger.info('카테고리별 검색', {
      category,
      keywords,
      center: { lat, lng },
      radius
    });

    // 각 키워드로 검색하여 결과 합침
    let allPlaces: PlaceInfo[] = [];

    for (const keyword of keywords) {
      try {
        // 네이버 API는 display 최대 5개
        const results = await naverSearchService.searchLocal(keyword, {
          display: Math.min(limit, 5),
          sort: 'random'
        });

        const places = results
          .map(result => this.mapNaverResultToPlaceInfo(result, lat, lng))
          .filter(place => this.isWithinRadius(place, lat, lng, radius));

        allPlaces = allPlaces.concat(places);

        // limit에 도달하면 중단
        if (allPlaces.length >= limit) break;
      } catch (error) {
        logger.warn('키워드 검색 실패', { keyword, error });
      }
    }

    // 거리순 정렬 및 중복 제거
    allPlaces = this.deduplicatePlaces(allPlaces);
    allPlaces.sort((a, b) => a.distance - b.distance);

    const resultPlaces = allPlaces.slice(0, limit);

    return {
      places: resultPlaces,
      total: allPlaces.length,
      hasMore: allPlaces.length > limit
    };
  }

  /**
   * 일반 장소 검색 (주변 모든 장소)
   */
  private async searchGeneral(
    lat: number,
    lng: number,
    radius: number,
    limit: number
  ): Promise<{ places: PlaceInfo[]; total: number; hasMore: boolean }> {
    logger.info('일반 장소 검색', {
      center: { lat, lng },
      radius
    });

    // 여러 키워드로 검색
    const generalKeywords = ['맛집', '카페', '술집', '문화', '쇼핑'];
    let allPlaces: PlaceInfo[] = [];

    for (const keyword of generalKeywords) {
      try {
        const results = await naverSearchService.searchLocal(keyword, {
          display: 3,
          sort: 'random'
        });

        const places = results
          .map(result => this.mapNaverResultToPlaceInfo(result, lat, lng))
          .filter(place => this.isWithinRadius(place, lat, lng, radius));

        allPlaces = allPlaces.concat(places);

        if (allPlaces.length >= limit) break;
      } catch (error) {
        logger.warn('일반 검색 실패', { keyword, error });
      }
    }

    // 중복 제거 및 정렬
    allPlaces = this.deduplicatePlaces(allPlaces);
    allPlaces.sort((a, b) => a.distance - b.distance);

    const resultPlaces = allPlaces.slice(0, limit);

    return {
      places: resultPlaces,
      total: allPlaces.length,
      hasMore: allPlaces.length > limit
    };
  }

  /**
   * 네이버 API 응답을 PlaceInfo로 변환
   */
  private mapNaverResultToPlaceInfo(result: any, centerLat: number, centerLng: number): PlaceInfo {
    const distance = this.calculateDistance(
      centerLat,
      centerLng,
      result.coordinates.lat,
      result.coordinates.lng
    );

    return {
      id: `place_${result.id}`,
      kakaoPlaceId: result.id,
      name: result.title,
      category: {
        code: this.getCategoryCodeFromText(result.category),
        name: result.category
      },
      address: result.address,
      roadAddress: result.roadAddress,
      coordinates: result.coordinates,
      distance,
      phone: undefined,
      url: undefined
    };
  }

  /**
   * 두 좌표 간 거리 계산 (미터)
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371e3; // 지구 반지름 (미터)
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  }

  /**
   * 반경 내 장소인지 확인
   */
  private isWithinRadius(place: PlaceInfo, centerLat: number, centerLng: number, radius: number): boolean {
    return place.distance <= radius;
  }

  /**
   * 중복 장소 제거
   */
  private deduplicatePlaces(places: PlaceInfo[]): PlaceInfo[] {
    const seen = new Set<string>();
    return places.filter(place => {
      // 이름과 주소가 같으면 중복으로 간주
      const key = `${place.name}_${place.address}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 카테고리 텍스트에서 코드 추출
   */
  private getCategoryCodeFromText(categoryText: string): string {
    if (categoryText.includes('카페') || categoryText.includes('커피')) return 'CAFE';
    if (categoryText.includes('음식') || categoryText.includes('식당')) return 'RESTAURANT';
    if (categoryText.includes('술집') || categoryText.includes('바')) return 'BAR';
    if (categoryText.includes('문화') || categoryText.includes('영화')) return 'CULTURE';
    if (categoryText.includes('쇼핑') || categoryText.includes('마트')) return 'SHOPPING';
    return 'ETC';
  }

  /**
   * 사용 가능한 카테고리 목록
   */
  getAvailableCategories() {
    return [
      {
        code: 'CAFE',
        name: '카페',
        description: '커피전문점, 카페, 디저트전문점',
        icon: '☕'
      },
      {
        code: 'RESTAURANT',
        name: '음식점',
        description: '한식, 중식, 일식, 양식, 기타음식',
        icon: '🍽️'
      },
      {
        code: 'BAR',
        name: '술집',
        description: '펍, 비어바, 노래방, 당구장',
        icon: '🍻'
      },
      {
        code: 'CULTURE',
        name: '문화시설',
        description: '영화관, 공연장, 박물관, 도서관',
        icon: '🎭'
      },
      {
        code: 'SHOPPING',
        name: '쇼핑',
        description: '백화점, 대형마트, 아울렛, 전자상가',
        icon: '🛍️'
      }
    ];
  }
}

// 싱글톤 인스턴스
export const placeSearchService = new PlaceSearchService();
