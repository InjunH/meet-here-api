/**
 * @fileoverview 지하철역 Repository 인터페이스 및 구현
 */

import type {
  SubwayStation,
  StationSearchOptions,
  Point
} from '@/types/subway.js';
import type { BaseRepository, PaginatedResult, PaginationOptions } from './base.repository.js';

/**
 * 지하철역 전용 Repository 인터페이스
 */
export interface ISubwayStationRepository extends BaseRepository<SubwayStation> {
  /**
   * 역명으로 검색
   * @param name 역명
   * @returns 해당 역명의 모든 호선 정보
   */
  findByName(name: string): Promise<SubwayStation[]>;

  /**
   * 호선으로 검색
   * @param line 호선 (예: "1호선")
   * @returns 해당 호선의 모든 역 정보
   */
  findByLine(line: string): Promise<SubwayStation[]>;

  /**
   * 위치 기반 근처 역 검색
   * @param center 중심점
   * @param radius 검색 반경 (미터)
   * @param limit 최대 결과 수
   * @returns 거리순 정렬된 근처 역 목록
   */
  findNearby(center: Point, radius: number, limit?: number): Promise<SubwayStation[]>;

  /**
   * 복합 검색 조건으로 검색
   * @param options 검색 옵션
   * @returns 검색 결과
   */
  search(options: StationSearchOptions): Promise<SubwayStation[]>;

  /**
   * 환승 가능한 역 조회 (같은 역명의 다른 호선들)
   * @param stationName 역명
   * @returns 환승 가능한 호선들
   */
  findTransferStations(stationName: string): Promise<SubwayStation[]>;

  /**
   * 페이지네이션과 함께 역 목록 조회
   * @param options 페이지네이션 옵션
   * @returns 페이지네이션 결과
   */
  findWithPagination(options: PaginationOptions): Promise<PaginatedResult<SubwayStation>>;

  /**
   * 모든 호선 목록 조회
   * @returns 고유한 호선 목록
   */
  findAllLines(): Promise<string[]>;

  /**
   * 특정 영역 내 역 조회
   * @param bounds 경계 좌표 (northeast, southwest)
   * @returns 해당 영역 내 역 목록
   */
  findWithinBounds(bounds: {
    northeast: Point;
    southwest: Point;
  }): Promise<SubwayStation[]>;
}

/**
 * In-Memory 지하철역 Repository 구현
 */
export class InMemorySubwayStationRepository implements ISubwayStationRepository {
  private stations: Map<string, SubwayStation> = new Map();

  constructor(stations: SubwayStation[] = []) {
    stations.forEach(station => {
      const id = this.generateId(station);
      this.stations.set(id, station);
    });
  }

  private generateId(station: SubwayStation): string {
    return `${station.code}_${station.line}`;
  }

  async findById(id: string): Promise<SubwayStation | null> {
    return this.stations.get(id) || null;
  }

  async findAll(): Promise<SubwayStation[]> {
    return Array.from(this.stations.values());
  }

  async create(data: Omit<SubwayStation, 'id' | 'createdAt' | 'updatedAt'>): Promise<SubwayStation> {
    const station = data as SubwayStation;
    const id = this.generateId(station);
    this.stations.set(id, station);
    return station;
  }

  async update(id: string, data: Partial<SubwayStation>): Promise<SubwayStation> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Station with id ${id} not found`);
    }

    const updated = { ...existing, ...data };
    this.stations.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.stations.delete(id);
  }

  async findByName(name: string): Promise<SubwayStation[]> {
    const stations = Array.from(this.stations.values());
    return stations.filter(station =>
      station.name === name || station.name.includes(name)
    );
  }

  async findByLine(line: string): Promise<SubwayStation[]> {
    const stations = Array.from(this.stations.values());
    return stations.filter(station => station.line === line);
  }

  async findNearby(center: Point, radius: number, limit: number = 10): Promise<SubwayStation[]> {
    const stations = Array.from(this.stations.values());

    // 거리 계산 및 필터링
    const nearbyStations = stations
      .map(station => {
        const distance = this.calculateHaversineDistance(center, station.coordinates);
        return { ...station, distance };
      })
      .filter(station => station.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    return nearbyStations;
  }

  async search(options: StationSearchOptions): Promise<SubwayStation[]> {
    let stations = Array.from(this.stations.values());

    // 역명 검색
    if (options.query) {
      stations = stations.filter(station =>
        station.name.includes(options.query!) ||
        station.name.toLowerCase().includes(options.query!.toLowerCase())
      );
    }

    // 호선 필터
    if (options.lines && options.lines.length > 0) {
      stations = stations.filter(station =>
        options.lines!.includes(station.line)
      );
    }

    // 위치 기반 필터
    if (options.lat && options.lng && options.radius) {
      const center = { lat: options.lat, lng: options.lng };
      stations = stations
        .map(station => {
          const distance = this.calculateHaversineDistance(center, station.coordinates);
          return { ...station, distance };
        })
        .filter(station => station.distance <= options.radius!)
        .sort((a, b) => a.distance - b.distance);
    }

    // 결과 개수 제한
    if (options.limit) {
      stations = stations.slice(0, options.limit);
    }

    return stations;
  }

  async findTransferStations(stationName: string): Promise<SubwayStation[]> {
    const stations = Array.from(this.stations.values());
    return stations.filter(station => station.name === stationName);
  }

  async findWithPagination(options: PaginationOptions): Promise<PaginatedResult<SubwayStation>> {
    const { page = 1, limit = 10, sortBy = 'name', sortOrder = 'asc' } = options;

    let stations = Array.from(this.stations.values());

    // 정렬
    stations.sort((a, b) => {
      const aValue = (a as any)[sortBy] || '';
      const bValue = (b as any)[sortBy] || '';

      if (sortOrder === 'desc') {
        return bValue.toString().localeCompare(aValue.toString());
      }
      return aValue.toString().localeCompare(bValue.toString());
    });

    // 페이지네이션
    const total = stations.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const data = stations.slice(startIndex, endIndex);

    return {
      data,
      total,
      page,
      limit,
      hasNext: endIndex < total,
      hasPrev: page > 1
    };
  }

  async findAllLines(): Promise<string[]> {
    const stations = Array.from(this.stations.values());
    const lines = new Set(stations.map(station => station.line));
    return Array.from(lines).sort();
  }

  async findWithinBounds(bounds: {
    northeast: Point;
    southwest: Point;
  }): Promise<SubwayStation[]> {
    const stations = Array.from(this.stations.values());

    return stations.filter(station => {
      const { lat, lng } = station.coordinates;
      return (
        lat >= bounds.southwest.lat &&
        lat <= bounds.northeast.lat &&
        lng >= bounds.southwest.lng &&
        lng <= bounds.northeast.lng
      );
    });
  }

  /**
   * 두 지점 간 Haversine 거리 계산 (미터)
   */
  private calculateHaversineDistance(point1: Point, point2: Point): number {
    const R = 6371000; // 지구 반지름 (미터)
    const lat1Rad = (point1.lat * Math.PI) / 180;
    const lat2Rad = (point2.lat * Math.PI) / 180;
    const deltaLat = ((point2.lat - point1.lat) * Math.PI) / 180;
    const deltaLng = ((point2.lng - point1.lng) * Math.PI) / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) *
      Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * 전체 역 개수 조회
   */
  getStationCount(): number {
    return this.stations.size;
  }

  /**
   * 서비스 준비 상태 확인
   */
  isReady(): boolean {
    return this.stations.size > 0;
  }
}