/**
 * @fileoverview 지하철역 및 중간지점 계산 관련 타입 정의
 */

// 원본 JSON 데이터 구조 (서울시 API)
export interface RawSubwayStationData {
  node_code: string;      // 역 코드 (예: "2000")
  node_name: string;      // 역명 (예: "시청")
  line_num: string;       // 호선 (예: "2호선")
  node_wkt: string;       // WKT 좌표 (예: "POINT(126.977503872108 37.57072118731253)")
}

// 파싱된 지하철역 정보
export interface SubwayStation {
  code: string;           // 역 코드
  name: string;           // 역명
  line: string;           // 호선
  coordinates: {
    lat: number;          // 위도 (WGS84)
    lng: number;          // 경도 (WGS84)
  };
  distance?: number;      // 중심점으로부터의 거리 (계산 시 추가)
}

// 중간지점 계산 요청
export interface MeetingPointRequest {
  participants: ParticipantLocation[];
  options?: MeetingPointOptions;
}

// 참가자 위치 정보
export interface ParticipantLocation {
  name: string;           // 참가자명 (예: "Person A")
  lat: number;            // 위도
  lng: number;            // 경도
  address?: string;       // 주소 (선택사항)
}

// 중간지점 계산 옵션
export interface MeetingPointOptions {
  transportType?: 'subway' | 'bus' | 'walking';  // 교통수단 (기본: subway)
  maxDistance?: number;                           // 중심점에서 최대 거리(m) (기본: 2000)
  maxResults?: number;                           // 최대 결과 개수 (기본: 5)
  includeTransfers?: boolean;                    // 환승역 우선 여부 (기본: true)
  weights?: number[];                            // 참가자별 가중치 (선택사항)
}

// 계산된 중간지점
export interface MeetingCenter {
  lat: number;            // 중심점 위도
  lng: number;            // 중심점 경도
  address?: string;       // 중심점 주소 (역계산)
  displayName?: string;   // 간단한 위치명 (예: "명동 근처")
}

// 중간지점 계산 응답
export interface MeetingPointResponse {
  center: MeetingCenter;                    // 계산된 중심점
  nearbyStations: SubwayStation[];          // 주변 지하철역 목록
  participants: ParticipantLocation[];      // 입력된 참가자 정보
  stats: {
    averageDistance: number;                // 평균 거리
    maxDistance: number;                    // 최대 거리
    minDistance: number;                    // 최소 거리
  };
}

// 지하철역 검색 옵션
export interface StationSearchOptions {
  query?: string;         // 역명 검색어
  lines?: string[];       // 호선 필터 (예: ["1호선", "2호선"])
  lat?: number;           // 기준 위도
  lng?: number;           // 기준 경도
  radius?: number;        // 검색 반경 (m)
  limit?: number;         // 결과 개수 제한
}

// 에러 타입
export interface MeetingPointError {
  code: string;
  message: string;
  details?: any;
}

// 거리 계산 결과
export interface DistanceCalculation {
  distance: number;       // 거리 (m)
  bearing: number;        // 방위각 (도)
}

// 기하학적 점
export interface Point {
  lat: number;
  lng: number;
}

// 가중치가 적용된 점
export interface WeightedPoint extends Point {
  weight?: number;
}