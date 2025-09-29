/**
 * @fileoverview 네이버 API Repository 인터페이스 및 구현
 * 역지오코딩 및 주소 검색 데이터 캐싱과 관리
 */

import type { Point } from '@/types/subway.js';
import type { AddressSuggestion, SearchOptions } from '@/services/naver-search.service.js';
import type { BaseRepository, PaginatedResult, PaginationOptions } from './base.repository.js';

/**
 * 역지오코딩 결과 캐시 데이터
 */
export interface ReverseGeocodeCache {
  id: string;
  coordinates: Point;
  address: string;
  roadAddress: string;
  district: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * 주소 검색 캐시 데이터
 */
export interface SearchCache {
  id: string;
  query: string;
  results: AddressSuggestion[];
  searchOptions: SearchOptions;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * API 사용량 추적 데이터
 */
export interface ApiUsage {
  id: string;
  apiType: 'reverseGeocode' | 'localSearch';
  timestamp: Date;
  success: boolean;
  errorCode?: string;
  responseTime: number;
  requestData?: any;
}

/**
 * 네이버 API Repository 인터페이스
 */
export interface INaverApiRepository {
  // === 역지오코딩 캐시 관리 ===

  /**
   * 역지오코딩 결과 캐시 저장
   */
  cacheReverseGeocode(data: Omit<ReverseGeocodeCache, 'id' | 'createdAt' | 'expiresAt'>): Promise<ReverseGeocodeCache>;

  /**
   * 좌표로 캐시된 역지오코딩 결과 조회
   */
  findCachedReverseGeocode(coordinates: Point, tolerance?: number): Promise<ReverseGeocodeCache | null>;

  /**
   * 만료된 역지오코딩 캐시 정리
   */
  cleanExpiredReverseGeocodeCache(): Promise<number>;

  // === 검색 캐시 관리 ===

  /**
   * 검색 결과 캐시 저장
   */
  cacheSearchResults(data: Omit<SearchCache, 'id' | 'createdAt' | 'expiresAt'>): Promise<SearchCache>;

  /**
   * 검색어로 캐시된 결과 조회
   */
  findCachedSearchResults(query: string, options?: SearchOptions): Promise<SearchCache | null>;

  /**
   * 만료된 검색 캐시 정리
   */
  cleanExpiredSearchCache(): Promise<number>;

  // === API 사용량 추적 ===

  /**
   * API 호출 기록 저장
   */
  recordApiUsage(data: Omit<ApiUsage, 'id' | 'timestamp'>): Promise<ApiUsage>;

  /**
   * 특정 기간의 API 사용 통계 조회
   */
  getUsageStats(startDate: Date, endDate: Date): Promise<{
    totalCalls: number;
    successRate: number;
    averageResponseTime: number;
    apiTypeCounts: Record<string, number>;
    errorCounts: Record<string, number>;
  }>;

  /**
   * 최근 API 사용량 조회 (일별)
   */
  getDailyUsage(days: number): Promise<Array<{
    date: string;
    reverseGeocodeCalls: number;
    localSearchCalls: number;
    totalCalls: number;
    successRate: number;
  }>>;

  // === 캐시 관리 ===

  /**
   * 모든 캐시 정리
   */
  clearAllCache(): Promise<{ reverseGeocodeCleared: number; searchCleared: number }>;

  /**
   * 캐시 통계 조회
   */
  getCacheStats(): Promise<{
    reverseGeocodeCount: number;
    searchCacheCount: number;
    totalSize: number;
    hitRate: number;
  }>;
}

/**
 * In-Memory 네이버 API Repository 구현
 */
export class InMemoryNaverApiRepository implements INaverApiRepository {
  private reverseGeocodeCache: Map<string, ReverseGeocodeCache> = new Map();
  private searchCache: Map<string, SearchCache> = new Map();
  private apiUsage: Map<string, ApiUsage> = new Map();
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  private reverseGeocodeIdCounter: number = 1;
  private searchCacheIdCounter: number = 1;
  private apiUsageIdCounter: number = 1;

  /**
   * 좌표를 기반으로 캐시 키 생성 (소수점 4자리까지 반올림)
   */
  private generateCoordinateKey(coordinates: Point): string {
    const lat = Math.round(coordinates.lat * 10000) / 10000;
    const lng = Math.round(coordinates.lng * 10000) / 10000;
    return `${lat},${lng}`;
  }

  /**
   * 검색 쿼리와 옵션을 기반으로 캐시 키 생성
   */
  private generateSearchKey(query: string, options?: SearchOptions): string {
    const optionsStr = options ? JSON.stringify(options) : '';
    return `${query}_${optionsStr}`;
  }

  // === 역지오코딩 캐시 관리 ===

  async cacheReverseGeocode(data: Omit<ReverseGeocodeCache, 'id' | 'createdAt' | 'expiresAt'>): Promise<ReverseGeocodeCache> {
    const id = `reverse_${this.reverseGeocodeIdCounter++}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24시간 후 만료

    const cacheItem: ReverseGeocodeCache = {
      ...data,
      id,
      createdAt: now,
      expiresAt
    };

    const key = this.generateCoordinateKey(data.coordinates);
    this.reverseGeocodeCache.set(key, cacheItem);

    return cacheItem;
  }

  async findCachedReverseGeocode(coordinates: Point, tolerance: number = 0.0001): Promise<ReverseGeocodeCache | null> {
    // 정확한 매치 시도
    const exactKey = this.generateCoordinateKey(coordinates);
    let cached = this.reverseGeocodeCache.get(exactKey);

    if (cached) {
      if (cached.expiresAt > new Date()) {
        this.cacheHits++;
        return cached;
      } else {
        this.reverseGeocodeCache.delete(exactKey);
      }
    }

    // tolerance 범위 내 검색
    for (const [key, cache] of this.reverseGeocodeCache.entries()) {
      if (cache.expiresAt <= new Date()) {
        this.reverseGeocodeCache.delete(key);
        continue;
      }

      const latDiff = Math.abs(cache.coordinates.lat - coordinates.lat);
      const lngDiff = Math.abs(cache.coordinates.lng - coordinates.lng);

      if (latDiff <= tolerance && lngDiff <= tolerance) {
        this.cacheHits++;
        return cache;
      }
    }

    this.cacheMisses++;
    return null;
  }

  async cleanExpiredReverseGeocodeCache(): Promise<number> {
    const now = new Date();
    let cleaned = 0;

    for (const [key, cache] of this.reverseGeocodeCache.entries()) {
      if (cache.expiresAt <= now) {
        this.reverseGeocodeCache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  // === 검색 캐시 관리 ===

  async cacheSearchResults(data: Omit<SearchCache, 'id' | 'createdAt' | 'expiresAt'>): Promise<SearchCache> {
    const id = `search_${this.searchCacheIdCounter++}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1시간 후 만료

    const cacheItem: SearchCache = {
      ...data,
      id,
      createdAt: now,
      expiresAt
    };

    const key = this.generateSearchKey(data.query, data.searchOptions);
    this.searchCache.set(key, cacheItem);

    return cacheItem;
  }

  async findCachedSearchResults(query: string, options?: SearchOptions): Promise<SearchCache | null> {
    const key = this.generateSearchKey(query, options);
    const cached = this.searchCache.get(key);

    if (!cached) {
      this.cacheMisses++;
      return null;
    }

    if (cached.expiresAt <= new Date()) {
      this.searchCache.delete(key);
      this.cacheMisses++;
      return null;
    }

    this.cacheHits++;
    return cached;
  }

  async cleanExpiredSearchCache(): Promise<number> {
    const now = new Date();
    let cleaned = 0;

    for (const [key, cache] of this.searchCache.entries()) {
      if (cache.expiresAt <= now) {
        this.searchCache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  // === API 사용량 추적 ===

  async recordApiUsage(data: Omit<ApiUsage, 'id' | 'timestamp'>): Promise<ApiUsage> {
    const id = `usage_${this.apiUsageIdCounter++}`;
    const usage: ApiUsage = {
      ...data,
      id,
      timestamp: new Date()
    };

    this.apiUsage.set(id, usage);
    return usage;
  }

  async getUsageStats(startDate: Date, endDate: Date): Promise<{
    totalCalls: number;
    successRate: number;
    averageResponseTime: number;
    apiTypeCounts: Record<string, number>;
    errorCounts: Record<string, number>;
  }> {
    const usages = Array.from(this.apiUsage.values()).filter(usage =>
      usage.timestamp >= startDate && usage.timestamp <= endDate
    );

    if (usages.length === 0) {
      return {
        totalCalls: 0,
        successRate: 0,
        averageResponseTime: 0,
        apiTypeCounts: {},
        errorCounts: {}
      };
    }

    const totalCalls = usages.length;
    const successfulCalls = usages.filter(u => u.success).length;
    const successRate = (successfulCalls / totalCalls) * 100;

    const totalResponseTime = usages.reduce((sum, u) => sum + u.responseTime, 0);
    const averageResponseTime = totalResponseTime / totalCalls;

    const apiTypeCounts: Record<string, number> = {};
    const errorCounts: Record<string, number> = {};

    usages.forEach(usage => {
      apiTypeCounts[usage.apiType] = (apiTypeCounts[usage.apiType] || 0) + 1;

      if (!usage.success && usage.errorCode) {
        errorCounts[usage.errorCode] = (errorCounts[usage.errorCode] || 0) + 1;
      }
    });

    return {
      totalCalls,
      successRate,
      averageResponseTime,
      apiTypeCounts,
      errorCounts
    };
  }

  async getDailyUsage(days: number): Promise<Array<{
    date: string;
    reverseGeocodeCalls: number;
    localSearchCalls: number;
    totalCalls: number;
    successRate: number;
  }>> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const usages = Array.from(this.apiUsage.values()).filter(usage =>
      usage.timestamp >= startDate && usage.timestamp <= endDate
    );

    const dailyStats: Map<string, {
      date: string;
      reverseGeocodeCalls: number;
      localSearchCalls: number;
      totalCalls: number;
      successfulCalls: number;
    }> = new Map();

    // 날짜별로 집계
    usages.forEach(usage => {
      const dateKey = usage.timestamp.toISOString().split('T')[0];

      if (!dailyStats.has(dateKey)) {
        dailyStats.set(dateKey, {
          date: dateKey,
          reverseGeocodeCalls: 0,
          localSearchCalls: 0,
          totalCalls: 0,
          successfulCalls: 0
        });
      }

      const stats = dailyStats.get(dateKey)!;
      stats.totalCalls++;

      if (usage.success) {
        stats.successfulCalls++;
      }

      if (usage.apiType === 'reverseGeocode') {
        stats.reverseGeocodeCalls++;
      } else if (usage.apiType === 'localSearch') {
        stats.localSearchCalls++;
      }
    });

    // 성공률 계산하여 결과 배열 생성
    return Array.from(dailyStats.values()).map(stats => ({
      date: stats.date,
      reverseGeocodeCalls: stats.reverseGeocodeCalls,
      localSearchCalls: stats.localSearchCalls,
      totalCalls: stats.totalCalls,
      successRate: stats.totalCalls > 0 ? (stats.successfulCalls / stats.totalCalls) * 100 : 0
    })).sort((a, b) => a.date.localeCompare(b.date));
  }

  // === 캐시 관리 ===

  async clearAllCache(): Promise<{ reverseGeocodeCleared: number; searchCleared: number }> {
    const reverseGeocodeCleared = this.reverseGeocodeCache.size;
    const searchCleared = this.searchCache.size;

    this.reverseGeocodeCache.clear();
    this.searchCache.clear();

    // 캐시 통계 리셋
    this.cacheHits = 0;
    this.cacheMisses = 0;

    return { reverseGeocodeCleared, searchCleared };
  }

  async getCacheStats(): Promise<{
    reverseGeocodeCount: number;
    searchCacheCount: number;
    totalSize: number;
    hitRate: number;
  }> {
    // 만료된 캐시 정리
    await this.cleanExpiredReverseGeocodeCache();
    await this.cleanExpiredSearchCache();

    const reverseGeocodeCount = this.reverseGeocodeCache.size;
    const searchCacheCount = this.searchCache.size;
    const totalSize = reverseGeocodeCount + searchCacheCount;

    const totalAttempts = this.cacheHits + this.cacheMisses;
    const hitRate = totalAttempts > 0 ? (this.cacheHits / totalAttempts) * 100 : 0;

    return {
      reverseGeocodeCount,
      searchCacheCount,
      totalSize,
      hitRate
    };
  }

  /**
   * 전체 API 사용량 기록 개수 조회
   */
  async getUsageRecordCount(): Promise<number> {
    return this.apiUsage.size;
  }

  /**
   * 오래된 API 사용량 기록 정리 (30일 이전)
   */
  async cleanOldUsageRecords(): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let cleaned = 0;

    for (const [id, usage] of this.apiUsage.entries()) {
      if (usage.timestamp < thirtyDaysAgo) {
        this.apiUsage.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * 최근 에러 발생 현황 조회
   */
  async getRecentErrors(hours: number = 24): Promise<ApiUsage[]> {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    return Array.from(this.apiUsage.values())
      .filter(usage =>
        usage.timestamp >= startTime &&
        !usage.success
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}