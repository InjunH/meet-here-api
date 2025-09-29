/**
 * @fileoverview 지하철역 데이터 관리 및 검색 서비스
 * 로컬 JSON 파일에서 지하철역 데이터를 로드하고 다양한 검색 기능 제공
 */

import fs from 'fs';
import path from 'path';
import { logger } from '@/utils/logger.js';
import type {
  RawSubwayStationData,
  SubwayStation,
  StationSearchOptions,
  Point,
  DistanceCalculation
} from '@/types/subway.js';

export class SubwayStationService {
  private stations: SubwayStation[] = [];
  private isLoaded = false;
  private readonly dataPath: string;

  constructor() {
    this.dataPath = path.join(process.cwd(), 'src/data/seoul-subway-stations.json');
    this.loadStations();
  }

  /**
   * WKT POINT 형식을 lat/lng 좌표로 변환
   * @param wkt WKT 문자열 (예: "POINT(126.977503872108 37.57072118731253)")
   * @returns 변환된 좌표 {lat, lng}
   */
  private parseWKTPoint(wkt: string): { lat: number; lng: number } {
    try {
      // POINT(경도 위도) 형식에서 좌표 추출
      const match = wkt.match(/POINT\(([^\s]+)\s+([^)]+)\)/);
      if (!match) {
        throw new Error(`Invalid WKT format: ${wkt}`);
      }

      const lng = parseFloat(match[1]);
      const lat = parseFloat(match[2]);

      if (isNaN(lat) || isNaN(lng)) {
        throw new Error(`Invalid coordinates in WKT: ${wkt}`);
      }

      return { lat, lng };
    } catch (error) {
      logger.error('WKT 파싱 실패', { wkt, error });
      throw error;
    }
  }

  /**
   * JSON 파일에서 지하철역 데이터 로드
   */
  private async loadStations(): Promise<void> {
    try {
      logger.info('지하철역 데이터 로딩 시작', { path: this.dataPath });

      if (!fs.existsSync(this.dataPath)) {
        logger.warn('지하철역 데이터 파일이 없습니다', { path: this.dataPath });
        this.isLoaded = true;
        return;
      }

      const rawData = fs.readFileSync(this.dataPath, 'utf-8');
      const stationData: RawSubwayStationData[] = JSON.parse(rawData);

      this.stations = stationData.map((raw) => {
        const coordinates = this.parseWKTPoint(raw.node_wkt);

        return {
          code: raw.node_code,
          name: raw.node_name,
          line: raw.line_num,
          coordinates
        };
      });

      this.isLoaded = true;
      logger.info('지하철역 데이터 로딩 완료', {
        totalStations: this.stations.length,
        sampleStations: this.stations.slice(0, 3).map(s => ({
          name: s.name,
          line: s.line,
          coordinates: s.coordinates
        }))
      });

    } catch (error) {
      logger.error('지하철역 데이터 로딩 실패', {
        path: this.dataPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.isLoaded = true; // 실패해도 서비스 계속 진행
      throw error;
    }
  }

  /**
   * 서비스 준비 상태 확인
   */
  public isReady(): boolean {
    return this.isLoaded;
  }

  /**
   * 전체 지하철역 개수 반환
   */
  public getStationCount(): number {
    return this.stations.length;
  }

  /**
   * Haversine 공식을 사용한 두 지점 간 거리 계산 (미터)
   * @param point1 첫 번째 지점
   * @param point2 두 번째 지점
   * @returns 거리 계산 결과
   */
  public calculateDistance(point1: Point, point2: Point): DistanceCalculation {
    const R = 6371000; // 지구 반지름 (미터)

    const lat1Rad = (point1.lat * Math.PI) / 180;
    const lat2Rad = (point2.lat * Math.PI) / 180;
    const deltaLatRad = ((point2.lat - point1.lat) * Math.PI) / 180;
    const deltaLngRad = ((point2.lng - point1.lng) * Math.PI) / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // 방위각 계산
    const y = Math.sin(deltaLngRad) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLngRad);
    const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

    return { distance, bearing };
  }

  /**
   * 역명으로 지하철역 검색
   * @param query 검색어 (부분 일치)
   * @param limit 결과 개수 제한 (기본: 10)
   * @returns 검색된 지하철역 배열
   */
  public searchByName(query: string, limit: number = 10): SubwayStation[] {
    if (!this.isLoaded) {
      logger.warn('지하철역 데이터가 아직 로드되지 않았습니다');
      return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) {
      return [];
    }

    logger.info('역명 검색 실행', { query, limit });

    const results = this.stations
      .filter(station =>
        station.name.toLowerCase().includes(normalizedQuery)
      )
      .slice(0, limit);

    logger.info('역명 검색 완료', {
      query,
      resultCount: results.length,
      results: results.map(s => ({ name: s.name, line: s.line }))
    });

    return results;
  }

  /**
   * 특정 좌표 주변의 지하철역 검색
   * @param center 중심 좌표
   * @param radiusMeters 검색 반경 (미터)
   * @param limit 결과 개수 제한 (기본: 10)
   * @returns 거리순으로 정렬된 지하철역 배열
   */
  public searchNearby(
    center: Point,
    radiusMeters: number = 2000,
    limit: number = 10
  ): SubwayStation[] {
    if (!this.isLoaded) {
      logger.warn('지하철역 데이터가 아직 로드되지 않았습니다');
      return [];
    }

    logger.info('주변 지하철역 검색 실행', {
      center,
      radiusMeters,
      limit
    });

    const stationsWithDistance = this.stations
      .map(station => {
        const distanceCalc = this.calculateDistance(center, station.coordinates);
        return {
          ...station,
          distance: distanceCalc.distance
        };
      })
      .filter(station => station.distance <= radiusMeters)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    logger.info('주변 지하철역 검색 완료', {
      center,
      radiusMeters,
      resultCount: stationsWithDistance.length,
      nearestStations: stationsWithDistance.slice(0, 3).map(s => ({
        name: s.name,
        line: s.line,
        distance: Math.round(s.distance)
      }))
    });

    return stationsWithDistance;
  }

  /**
   * 호선별 지하철역 검색
   * @param lines 호선 배열 (예: ["2호선", "3호선"])
   * @param limit 결과 개수 제한 (기본: 50)
   * @returns 해당 호선의 지하철역 배열
   */
  public searchByLines(lines: string[], limit: number = 50): SubwayStation[] {
    if (!this.isLoaded) {
      logger.warn('지하철역 데이터가 아직 로드되지 않았습니다');
      return [];
    }

    logger.info('호선별 검색 실행', { lines, limit });

    const results = this.stations
      .filter(station => lines.includes(station.line))
      .slice(0, limit);

    logger.info('호선별 검색 완료', {
      lines,
      resultCount: results.length
    });

    return results;
  }

  /**
   * 통합 검색 기능
   * @param options 검색 옵션
   * @returns 검색된 지하철역 배열
   */
  public search(options: StationSearchOptions): SubwayStation[] {
    let results: SubwayStation[] = [];

    // 역명 검색
    if (options.query) {
      results = this.searchByName(options.query, options.limit || 10);
    }
    // 좌표 기반 검색
    else if (options.lat && options.lng) {
      results = this.searchNearby(
        { lat: options.lat, lng: options.lng },
        options.radius || 2000,
        options.limit || 10
      );
    }
    // 호선별 검색
    else if (options.lines && options.lines.length > 0) {
      results = this.searchByLines(options.lines, options.limit || 50);
    }
    // 전체 역 반환 (제한적)
    else {
      results = this.stations.slice(0, options.limit || 20);
    }

    return results;
  }

  /**
   * 특정 역 코드로 지하철역 조회
   * @param code 역 코드
   * @returns 지하철역 정보 또는 null
   */
  public getStationByCode(code: string): SubwayStation | null {
    if (!this.isLoaded) {
      return null;
    }

    const station = this.stations.find(s => s.code === code);
    return station || null;
  }

  /**
   * 환승역 검색 (같은 역명의 여러 호선)
   * @param stationName 역명
   * @returns 해당 역의 모든 호선 정보
   */
  public getTransferStations(stationName: string): SubwayStation[] {
    if (!this.isLoaded) {
      return [];
    }

    return this.stations.filter(station =>
      station.name === stationName
    );
  }

  /**
   * 서비스 상태 확인
   */
  public getStatus() {
    return {
      isLoaded: this.isLoaded,
      stationCount: this.stations.length,
      dataPath: this.dataPath,
      lastUpdated: new Date().toISOString()
    };
  }
}

// 싱글톤 인스턴스 생성
export const subwayStationService = new SubwayStationService();