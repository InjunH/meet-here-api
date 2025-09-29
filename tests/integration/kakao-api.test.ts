/**
 * @fileoverview Kakao API 엔드포인트 통합 테스트
 */

import request from 'supertest';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import app from '../../src/app';
import { TEST_COORDINATES, createKakaoSearchResponse } from '../helpers/test-data';

// API 클라이언트 모킹
jest.mock('../../src/lib/api-clients', () => ({
  kakaoSearchClient: {
    searchPlaces: jest.fn(),
    testConnection: jest.fn()
  }
}));

import { kakaoSearchClient } from '../../src/lib/api-clients';

const mockKakaoSearchClient = kakaoSearchClient as jest.Mocked<typeof kakaoSearchClient>;

describe('Kakao API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/kakao/search-places', () => {
    it('검색어와 좌표로 장소 검색 시 결과를 반환해야 한다', async () => {
      // Mock API 응답 설정
      const mockResponse = createKakaoSearchResponse([
        {
          place_name: '스타벅스 강남역점',
          category_name: '음식점 > 카페 > 커피전문점',
          address_name: '서울 강남구 역삼동 123-45',
          road_address_name: '서울 강남구 강남대로 123',
          x: '127.0276',
          y: '37.4979'
        }
      ]);

      mockKakaoSearchClient.searchPlaces.mockResolvedValue({
        data: mockResponse
      } as any);

      const response = await request(app)
        .post('/api/v1/kakao/search-places')
        .send({
          query: '카페',
          x: TEST_COORDINATES.SEOUL_STATION.lng,
          y: TEST_COORDINATES.SEOUL_STATION.lat,
          radius: 1000
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          places: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              name: expect.any(String),
              category: expect.any(String),
              address: expect.any(String),
              roadAddress: expect.any(String),
              position: expect.objectContaining({
                lat: expect.any(Number),
                lng: expect.any(Number)
              }),
              distance: expect.any(String)
            })
          ]),
          totalCount: expect.any(Number),
          hasMore: expect.any(Boolean)
        },
        timestamp: expect.any(String)
      });

      expect(mockKakaoSearchClient.searchPlaces).toHaveBeenCalledWith({
        query: '카페',
        x: TEST_COORDINATES.SEOUL_STATION.lng,
        y: TEST_COORDINATES.SEOUL_STATION.lat,
        radius: 1000
      });
    });

    it('필수 파라미터가 누락된 경우 400 에러를 반환해야 한다', async () => {
      const response = await request(app)
        .post('/api/v1/kakao/search-places')
        .send({
          // query 누락
          x: TEST_COORDINATES.SEOUL_STATION.lng,
          y: TEST_COORDINATES.SEOUL_STATION.lat
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Bad Request',
        message: expect.stringContaining('필수'),
        errorCode: 'VALIDATION_ERROR',
        timestamp: expect.any(String)
      });

      expect(mockKakaoSearchClient.searchPlaces).not.toHaveBeenCalled();
    });

    it('잘못된 좌표 형식으로 요청 시 400 에러를 반환해야 한다', async () => {
      const response = await request(app)
        .post('/api/v1/kakao/search-places')
        .send({
          query: '카페',
          x: 'invalid',
          y: TEST_COORDINATES.SEOUL_STATION.lat
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Bad Request',
        message: expect.stringContaining('좌표'),
        errorCode: 'VALIDATION_ERROR',
        timestamp: expect.any(String)
      });
    });

    it('잘못된 반경 값으로 요청 시 400 에러를 반환해야 한다', async () => {
      const response = await request(app)
        .post('/api/v1/kakao/search-places')
        .send({
          query: '카페',
          x: TEST_COORDINATES.SEOUL_STATION.lng,
          y: TEST_COORDINATES.SEOUL_STATION.lat,
          radius: 30000 // 최대 범위 초과
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Bad Request',
        message: expect.stringContaining('반경'),
        errorCode: 'VALIDATION_ERROR',
        timestamp: expect.any(String)
      });
    });

    it('Kakao API 에러 시 적절한 에러 응답을 반환해야 한다', async () => {
      mockKakaoSearchClient.searchPlaces.mockRejectedValue(
        new Error('Kakao API Error')
      );

      const response = await request(app)
        .post('/api/v1/kakao/search-places')
        .send({
          query: '카페',
          x: TEST_COORDINATES.SEOUL_STATION.lng,
          y: TEST_COORDINATES.SEOUL_STATION.lat,
          radius: 1000
        })
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: expect.any(String),
        errorCode: 'INTERNAL_ERROR',
        timestamp: expect.any(String)
      });
    });
  });

  describe('GET /api/v1/kakao/place/:placeId', () => {
    it('장소 ID로 상세 정보 조회 시 결과를 반환해야 한다', async () => {
      const mockPlaceDetail = {
        id: '26853371',
        place_name: '스타벅스 강남역점',
        category_name: '음식점 > 카페 > 커피전문점',
        address_name: '서울 강남구 역삼동 123-45',
        road_address_name: '서울 강남구 강남대로 123',
        phone: '02-1522-3232',
        place_url: 'http://place.map.kakao.com/26853371',
        x: '127.0276',
        y: '37.4979'
      };

      mockKakaoSearchClient.searchPlaces.mockResolvedValue({
        data: {
          documents: [mockPlaceDetail],
          meta: { total_count: 1, pageable_count: 1, is_end: true }
        }
      } as any);

      const response = await request(app)
        .get('/api/v1/kakao/place/26853371')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          place: expect.objectContaining({
            id: '26853371',
            name: expect.any(String),
            category: expect.any(String),
            address: expect.any(String),
            roadAddress: expect.any(String),
            phone: expect.any(String),
            url: expect.any(String),
            position: expect.objectContaining({
              lat: expect.any(Number),
              lng: expect.any(Number)
            })
          })
        },
        timestamp: expect.any(String)
      });
    });

    it('존재하지 않는 장소 ID로 요청 시 404 에러를 반환해야 한다', async () => {
      mockKakaoSearchClient.searchPlaces.mockResolvedValue({
        data: {
          documents: [],
          meta: { total_count: 0, pageable_count: 0, is_end: true }
        }
      } as any);

      const response = await request(app)
        .get('/api/v1/kakao/place/nonexistent')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Not Found',
        message: expect.stringContaining('장소를 찾을 수 없습니다'),
        errorCode: 'PLACE_NOT_FOUND',
        timestamp: expect.any(String)
      });
    });
  });
});