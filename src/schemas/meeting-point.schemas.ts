/**
 * @fileoverview 중간지점 계산 API용 Zod 검증 스키마
 */

import { z } from 'zod';

// 기본 좌표 스키마 (서울·경기 수도권 지역 전체 범위로 확장)
export const coordinateSchema = z.object({
  lat: z.number()
    .min(37.0, '수도권 지역 위도 범위를 벗어났습니다')
    .max(38.0, '수도권 지역 위도 범위를 벗어났습니다'),
  lng: z.number()
    .min(126.0, '수도권 지역 경도 범위를 벗어났습니다')
    .max(128.0, '수도권 지역 경도 범위를 벗어났습니다')
});

// 참가자 위치 스키마
export const participantLocationSchema = z.object({
  name: z.string()
    .min(1, '참가자 이름은 필수입니다')
    .max(50, '참가자 이름은 50자를 초과할 수 없습니다')
    .trim(),
  lat: z.number()
    .min(37.0, '수도권 지역 위도 범위를 벗어났습니다')
    .max(38.0, '수도권 지역 위도 범위를 벗어났습니다'),
  lng: z.number()
    .min(126.0, '수도권 지역 경도 범위를 벗어났습니다')
    .max(128.0, '수도권 지역 경도 범위를 벗어났습니다'),
  address: z.string().optional()
});

// 중간지점 계산 옵션 스키마
export const meetingPointOptionsSchema = z.object({
  transportType: z.enum(['subway', 'bus', 'walking']).default('subway'),
  maxDistance: z.number()
    .min(100, '최소 100m 이상이어야 합니다')
    .max(10000, '최대 10km까지 설정 가능합니다')
    .default(2000),
  maxResults: z.number()
    .min(1, '최소 1개 이상의 결과가 필요합니다')
    .max(20, '최대 20개까지 조회 가능합니다')
    .default(5),
  includeTransfers: z.boolean().default(true),
  weights: z.array(z.number().min(0.1).max(10)).optional()
}).optional();

// 중간지점 계산 요청 스키마
export const meetingPointRequestSchema = z.object({
  participants: z.array(participantLocationSchema)
    .min(1, '최소 1명 이상의 참가자가 필요합니다')
    .max(10, '최대 10명까지 참가 가능합니다'),
  options: meetingPointOptionsSchema
}).refine(
  (data) => {
    // 가중치 배열이 있는 경우, 참가자 수와 일치해야 함
    if (data.options?.weights) {
      return data.options.weights.length === data.participants.length;
    }
    return true;
  },
  {
    message: '가중치 배열의 길이가 참가자 수와 일치해야 합니다',
    path: ['options', 'weights']
  }
);

// 지하철역 검색 옵션 스키마
export const stationSearchOptionsSchema = z.object({
  query: z.string().min(1).max(50).optional(),
  lines: z.array(z.string()).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  radius: z.number().min(100).max(10000).default(2000).optional(),
  limit: z.number().min(1).max(50).default(10).optional()
});

// 지하철역 정보 응답 스키마
export const subwayStationSchema = z.object({
  code: z.string(),
  name: z.string(),
  line: z.string(),
  coordinates: coordinateSchema,
  distance: z.number().optional()
});

// 중간지점 정보 응답 스키마
export const meetingCenterSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  address: z.string().optional()
});

// 거리 통계 응답 스키마
export const distanceStatsSchema = z.object({
  averageDistance: z.number(),
  maxDistance: z.number(),
  minDistance: z.number()
});

// 중간지점 계산 응답 스키마
export const meetingPointResponseSchema = z.object({
  center: meetingCenterSchema,
  nearbyStations: z.array(subwayStationSchema),
  participants: z.array(participantLocationSchema),
  stats: distanceStatsSchema
});

// API 공통 응답 스키마
export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema,
    message: z.string().optional(),
    timestamp: z.string()
  });

// 에러 응답 스키마
export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string(),
  details: z.any().optional(),
  timestamp: z.string()
});

// 중간지점 계산 API 응답 타입
export const calculateMeetingPointResponseSchema = apiResponseSchema(meetingPointResponseSchema);

// 지하철역 검색 API 응답 타입
export const searchStationsResponseSchema = apiResponseSchema(z.array(subwayStationSchema));

// 서비스 상태 응답 스키마
export const serviceStatusSchema = z.object({
  serviceName: z.string(),
  isReady: z.boolean(),
  subwayStationCount: z.number(),
  lastUpdated: z.string()
});

export const serviceStatusResponseSchema = apiResponseSchema(serviceStatusSchema);

// 타입 export
export type MeetingPointRequest = z.infer<typeof meetingPointRequestSchema>;
export type MeetingPointResponse = z.infer<typeof meetingPointResponseSchema>;
export type StationSearchOptions = z.infer<typeof stationSearchOptionsSchema>;
export type SubwayStation = z.infer<typeof subwayStationSchema>;
export type MeetingCenter = z.infer<typeof meetingCenterSchema>;
export type ParticipantLocation = z.infer<typeof participantLocationSchema>;
export type MeetingPointOptions = z.infer<typeof meetingPointOptionsSchema>;
export type DistanceStats = z.infer<typeof distanceStatsSchema>;
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;