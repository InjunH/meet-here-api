/**
 * @fileoverview 중간지점 계산 및 최적 만남장소 추천 서비스
 * 여러 참가자의 위치를 기반으로 기하학적 중심점을 계산하고 주변 지하철역 추천
 */

import { logger } from '@/utils/logger.js';
import { subwayStationService } from './subway-station.service.js';
import type {
  ParticipantLocation,
  MeetingPointRequest,
  MeetingPointResponse,
  MeetingCenter,
  MeetingPointOptions,
  Point,
  WeightedPoint,
  SubwayStation
} from '@/types/subway.js';

export class MeetingPointService {
  constructor() {
    logger.info('중간지점 계산 서비스 초기화');
  }

  /**
   * 기하학적 중심점 계산 (구면 좌표계 기반)
   * @param points 참가자 위치 배열
   * @param weights 가중치 배열 (선택사항)
   * @returns 계산된 중심점
   */
  public calculateGeometricCenter(
    points: Point[],
    weights?: number[]
  ): MeetingCenter {
    if (points.length === 0) {
      throw new Error('최소 1개 이상의 위치가 필요합니다');
    }

    if (points.length === 1) {
      return {
        lat: points[0].lat,
        lng: points[0].lng
      };
    }

    logger.info('기하학적 중심점 계산 시작', {
      pointCount: points.length,
      hasWeights: !!weights
    });

    // 가중치 기본값 설정
    const pointWeights = weights || new Array(points.length).fill(1);

    if (pointWeights.length !== points.length) {
      throw new Error('가중치 배열의 길이가 위치 배열과 다릅니다');
    }

    // 구면 좌표를 3D 직교좌표로 변환
    let x = 0, y = 0, z = 0;
    let totalWeight = 0;

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const weight = pointWeights[i];

      const latRad = (point.lat * Math.PI) / 180;
      const lngRad = (point.lng * Math.PI) / 180;

      // 3D 직교좌표로 변환 (가중치 적용)
      x += Math.cos(latRad) * Math.cos(lngRad) * weight;
      y += Math.cos(latRad) * Math.sin(lngRad) * weight;
      z += Math.sin(latRad) * weight;

      totalWeight += weight;
    }

    // 가중 평균 계산
    x /= totalWeight;
    y /= totalWeight;
    z /= totalWeight;

    // 3D 좌표를 다시 위도/경도로 변환
    const centralLng = Math.atan2(y, x);
    const centralSquareRoot = Math.sqrt(x * x + y * y);
    const centralLat = Math.atan2(z, centralSquareRoot);

    const center: MeetingCenter = {
      lat: (centralLat * 180) / Math.PI,
      lng: (centralLng * 180) / Math.PI
    };

    logger.info('기하학적 중심점 계산 완료', {
      center,
      inputPoints: points.length,
      totalWeight
    });

    return center;
  }

  /**
   * 중심점을 기준으로 각 참가자까지의 거리 통계 계산
   * @param center 중심점
   * @param participants 참가자 위치 배열
   * @returns 거리 통계
   */
  public calculateDistanceStats(
    center: MeetingCenter,
    participants: ParticipantLocation[]
  ) {
    const distances = participants.map(participant => {
      const distanceCalc = subwayStationService.calculateDistance(
        center,
        { lat: participant.lat, lng: participant.lng }
      );
      return distanceCalc.distance;
    });

    const averageDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    const maxDistance = Math.max(...distances);
    const minDistance = Math.min(...distances);

    return {
      averageDistance,
      maxDistance,
      minDistance,
      distances
    };
  }

  /**
   * 중심점 주변의 최적 지하철역 추천
   * @param center 중심점
   * @param options 검색 옵션
   * @returns 추천 지하철역 배열
   */
  public findOptimalStations(
    center: MeetingCenter,
    options: MeetingPointOptions = {}
  ): SubwayStation[] {
    const {
      maxDistance = 2000,
      maxResults = 5,
      includeTransfers = true
    } = options;

    logger.info('최적 지하철역 검색 시작', {
      center,
      maxDistance,
      maxResults,
      includeTransfers
    });

    // 중심점 주변 지하철역 검색
    const nearbyStations = subwayStationService.searchNearby(
      center,
      maxDistance,
      maxResults * 2 // 여분으로 더 많이 검색
    );

    let recommendedStations = nearbyStations;

    // 환승역 우선순위 적용
    if (includeTransfers) {
      const transferStations: SubwayStation[] = [];
      const regularStations: SubwayStation[] = [];

      nearbyStations.forEach(station => {
        // 같은 역명의 다른 호선이 있는지 확인 (환승역)
        const sameNameStations = subwayStationService.getTransferStations(station.name);
        if (sameNameStations.length > 1) {
          transferStations.push(station);
        } else {
          regularStations.push(station);
        }
      });

      // 환승역을 앞에, 일반역을 뒤에 배치
      recommendedStations = [
        ...transferStations.slice(0, Math.ceil(maxResults * 0.6)),
        ...regularStations.slice(0, Math.floor(maxResults * 0.4))
      ].slice(0, maxResults);
    } else {
      recommendedStations = nearbyStations.slice(0, maxResults);
    }

    logger.info('최적 지하철역 검색 완료', {
      center,
      nearbyCount: nearbyStations.length,
      recommendedCount: recommendedStations.length,
      stations: recommendedStations.map(s => ({
        name: s.name,
        line: s.line,
        distance: s.distance ? Math.round(s.distance) : undefined
      }))
    });

    return recommendedStations;
  }

  /**
   * 중간지점 계산 및 추천 지하철역 제공 (메인 기능)
   * @param request 중간지점 계산 요청
   * @returns 계산 결과 및 추천 지하철역
   */
  public async calculateMeetingPoint(
    request: MeetingPointRequest
  ): Promise<MeetingPointResponse> {
    const { participants, options = {} } = request;

    logger.info('중간지점 계산 요청 처리 시작', {
      participantCount: participants.length,
      options
    });

    // 입력 검증
    if (!participants || participants.length === 0) {
      throw new Error('최소 1명 이상의 참가자가 필요합니다');
    }

    if (participants.length > 10) {
      throw new Error('최대 10명까지 참가 가능합니다');
    }

    // 좌표 유효성 검증
    for (const participant of participants) {
      if (!this.isValidCoordinate(participant.lat, participant.lng)) {
        throw new Error(`유효하지 않은 좌표: ${participant.name} (${participant.lat}, ${participant.lng})`);
      }
    }

    try {
      // 1. 기하학적 중심점 계산
      const points: Point[] = participants.map(p => ({ lat: p.lat, lng: p.lng }));
      const weights = options.weights;
      const center = this.calculateGeometricCenter(points, weights);

      // 2. 거리 통계 계산
      const stats = this.calculateDistanceStats(center, participants);

      // 3. 주변 지하철역 검색
      const nearbyStations = this.findOptimalStations(center, options);

      // 4. 응답 구성
      const response: MeetingPointResponse = {
        center,
        nearbyStations,
        participants,
        stats: {
          averageDistance: Math.round(stats.averageDistance),
          maxDistance: Math.round(stats.maxDistance),
          minDistance: Math.round(stats.minDistance)
        }
      };

      logger.info('중간지점 계산 완료', {
        center,
        stationCount: nearbyStations.length,
        stats: response.stats
      });

      return response;

    } catch (error) {
      logger.error('중간지점 계산 실패', {
        participants: participants.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * 좌표 유효성 검증
   * @param lat 위도
   * @param lng 경도
   * @returns 유효 여부
   */
  private isValidCoordinate(lat: number, lng: number): boolean {
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !isNaN(lat) &&
      !isNaN(lng) &&
      isFinite(lat) &&
      isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  }

  /**
   * 두 지점 간 중간지점 계산 (간단한 버전)
   * @param point1 첫 번째 지점
   * @param point2 두 번째 지점
   * @returns 중간지점
   */
  public calculateMidpoint(point1: Point, point2: Point): MeetingCenter {
    return this.calculateGeometricCenter([point1, point2]);
  }

  /**
   * 중심점 계산 (테스트 호환용)
   * @param locations 위치 배열
   * @returns 중심점
   */
  public calculateCenterPoint(locations: Point[]): MeetingCenter {
    return this.calculateGeometricCenter(locations);
  }

  /**
   * 가중치를 고려한 중심점 계산 (테스트 호환용)
   * @param locations 위치 배열
   * @param weights 가중치 배열
   * @returns 가중치 중심점
   */
  public calculateWeightedCenterPoint(locations: Point[], weights: number[]): MeetingCenter {
    if (weights.length === 0) {
      return this.calculateGeometricCenter(locations);
    }
    return this.calculateGeometricCenter(locations, weights);
  }

  /**
   * 위치 배열의 경계 계산
   * @param locations 위치 배열
   * @returns 경계 좌표
   */
  public calculateBounds(locations: Point[]): {
    northeast: Point;
    southwest: Point;
  } {
    if (locations.length === 0) {
      throw new Error('위치 배열이 비어있습니다');
    }

    if (locations.length === 1) {
      return {
        northeast: { lat: locations[0].lat, lng: locations[0].lng },
        southwest: { lat: locations[0].lat, lng: locations[0].lng }
      };
    }

    let minLat = locations[0].lat;
    let maxLat = locations[0].lat;
    let minLng = locations[0].lng;
    let maxLng = locations[0].lng;

    for (const location of locations) {
      minLat = Math.min(minLat, location.lat);
      maxLat = Math.max(maxLat, location.lat);
      minLng = Math.min(minLng, location.lng);
      maxLng = Math.max(maxLng, location.lng);
    }

    return {
      northeast: { lat: maxLat, lng: maxLng },
      southwest: { lat: minLat, lng: minLng }
    };
  }

  /**
   * 중심점에서 각 위치까지의 거리 계산
   * @param centerPoint 중심점
   * @param locations 위치 배열
   * @returns 거리 통계
   */
  public calculateDistances(centerPoint: MeetingCenter, locations: Point[]): {
    distances: number[];
    totalDistance: number;
    averageDistance: number;
  } {
    const distances = locations.map(location => {
      return this.calculateHaversineDistance(centerPoint, location);
    });

    const totalDistance = distances.reduce((sum, distance) => sum + distance, 0);
    const averageDistance = totalDistance / distances.length;

    return {
      distances,
      totalDistance,
      averageDistance
    };
  }

  /**
   * 위치 유효성 검증 (테스트 호환용)
   * @param locations 위치 배열
   */
  public validateLocations(locations: Point[]): void {
    if (!locations || locations.length === 0) {
      throw new Error('최소 1개 이상의 위치가 필요합니다');
    }

    if (locations.length === 1) {
      throw new Error('최소 2개 이상의 위치가 필요합니다');
    }

    for (const location of locations) {
      if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
        throw new Error('유효하지 않은 위치 데이터입니다');
      }

      if (!this.isValidCoordinate(location.lat, location.lng)) {
        throw new Error(`유효하지 않은 좌표: (${location.lat}, ${location.lng})`);
      }
    }
  }

  /**
   * 두 지점 간 Haversine 거리 계산 (미터 단위)
   * @param point1 첫 번째 지점
   * @param point2 두 번째 지점
   * @returns 거리 (미터)
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
   * 서비스 상태 확인
   */
  public getStatus() {
    return {
      serviceName: 'MeetingPointService',
      isReady: subwayStationService.isReady(),
      subwayStationCount: subwayStationService.getStationCount(),
      lastUpdated: new Date().toISOString()
    };
  }
}

// 싱글톤 인스턴스 생성
export const meetingPointService = new MeetingPointService();