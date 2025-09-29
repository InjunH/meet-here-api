/**
 * @fileoverview Naver API 엔드포인트 통합 테스트
 */

import request from 'supertest';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import app from '../../src/app';
import { TEST_COORDINATES, createNaverReverseGeocodeResponse, createErrorResponse } from '../helpers/test-data';

// API 클라이언트 모킹
jest.mock('../../src/lib/api-clients', () => ({
  naverCloudClient: {
    reverseGeocode: jest.fn(),
    testConnection: jest.fn()
  }
}));

// 네이버 검색 서비스 모킹
jest.mock('../../src/services/naver-search.service', () => ({
  naverSearchService: {
    searchLocal: jest.fn()
  }
}));

import { naverCloudClient } from '../../src/lib/api-clients';
import { naverSearchService } from '../../src/services/naver-search.service';

const mockNaverCloudClient = naverCloudClient as jest.Mocked<typeof naverCloudClient>;
const mockNaverSearchService = naverSearchService as jest.Mocked<typeof naverSearchService>;

describe('Naver API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/naver/reverse-geocode', () => {
    it('올바른 좌표로 역지오코딩 요청 시 주소 정보를 반환해야 한다', async () => {
      // Mock API 응답 설정
      const mockResponse = createNaverReverseGeocodeResponse();
      mockNaverCloudClient.reverseGeocode.mockResolvedValue({
        data: mockResponse
      } as any);

      const response = await request(app)
        .post('/api/v1/naver/reverse-geocode')
        .send({
          lat: TEST_COORDINATES.SEOUL_STATION.lat,
          lng: TEST_COORDINATES.SEOUL_STATION.lng
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          address: expect.any(String),
          roadAddress: expect.any(String),
          district: expect.any(String)
        },
        timestamp: expect.any(String)
      });

      expect(mockNaverCloudClient.reverseGeocode).toHaveBeenCalledWith(
        `${TEST_COORDINATES.SEOUL_STATION.lng},${TEST_COORDINATES.SEOUL_STATION.lat}`,
        {
          sourceCrs: 'epsg:4326',
          orders: 'admcode,legalcode,addr,roadaddr',
          output: 'json'
        }
      );
    });

    it('잘못된 좌표 형식으로 요청 시 400 에러를 반환해야 한다', async () => {
      const response = await request(app)
        .post('/api/v1/naver/reverse-geocode')
        .send({
          lat: 'invalid',
          lng: TEST_COORDINATES.SEOUL_STATION.lng
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Bad Request',
        message: expect.stringContaining('number'),
        timestamp: expect.any(String)
      });

      expect(mockNaverCloudClient.reverseGeocode).not.toHaveBeenCalled();
    });

    it('범위를 벗어난 좌표로 요청 시 400 에러를 반환해야 한다', async () => {
      const response = await request(app)
        .post('/api/v1/naver/reverse-geocode')
        .send({
          lat: TEST_COORDINATES.INVALID.lat,
          lng: TEST_COORDINATES.INVALID.lng
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Bad Request',
        message: expect.stringContaining('90'),
        timestamp: expect.any(String)
      });
    });

    it('필수 파라미터가 누락된 경우 400 에러를 반환해야 한다', async () => {
      const response = await request(app)
        .post('/api/v1/naver/reverse-geocode')
        .send({
          lat: TEST_COORDINATES.SEOUL_STATION.lat
          // lng 누락
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Bad Request',
        message: expect.stringContaining('Required'),
        timestamp: expect.any(String)
      });
    });

    it('Naver API 에러 시 적절한 에러 응답을 반환해야 한다', async () => {
      // Mock API 에러 응답
      const mockErrorResponse = {
        status: { code: 100, message: '잘못된 요청입니다', name: 'invalid request' },
        results: []
      };

      mockNaverCloudClient.reverseGeocode.mockResolvedValue({
        data: mockErrorResponse
      } as any);

      const response = await request(app)
        .post('/api/v1/naver/reverse-geocode')
        .send({
          lat: TEST_COORDINATES.SEOUL_STATION.lat,
          lng: TEST_COORDINATES.SEOUL_STATION.lng
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Bad Request',
        message: expect.stringContaining('좌표 변환 실패'),
        timestamp: expect.any(String)
      });
    });

    it('네트워크 에러 발생 시 500 에러를 반환해야 한다', async () => {
      mockNaverCloudClient.reverseGeocode.mockRejectedValue(
        new Error('Network Error')
      );

      const response = await request(app)
        .post('/api/v1/naver/reverse-geocode')
        .send({
          lat: TEST_COORDINATES.SEOUL_STATION.lat,
          lng: TEST_COORDINATES.SEOUL_STATION.lng
        })
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: expect.any(String),
        timestamp: expect.any(String)
      });
    });
  });

  describe('POST /api/v1/naver/autocomplete', () => {
    it('검색어로 자동완성 요청 시 검색 결과를 반환해야 한다', async () => {
      // Mock 검색 결과 설정
      const mockSearchResults = [
        {
          id: '1',
          title: '강남역',
          address: '서울특별시 강남구',
          roadAddress: '서울특별시 강남구 강남대로',
          category: '지하철역',
          coordinates: { lat: 37.4979, lng: 127.0276 }
        }
      ];

      mockNaverSearchService.searchLocal.mockResolvedValue(mockSearchResults);

      const response = await request(app)
        .post('/api/v1/naver/autocomplete')
        .send({
          query: '강남역'
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockSearchResults,
        timestamp: expect.any(String)
      });
    });

    it('빈 검색어로 요청 시 400 에러를 반환해야 한다', async () => {
      const response = await request(app)
        .post('/api/v1/naver/autocomplete')
        .send({
          query: ''
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Bad Request',
        message: expect.stringContaining('2글자'),
        timestamp: expect.any(String)
      });
    });

    it('너무 긴 검색어로 요청 시 400 에러를 반환해야 한다', async () => {
      const longQuery = 'a'.repeat(101); // 100자 초과

      const response = await request(app)
        .post('/api/v1/naver/autocomplete')
        .send({
          query: longQuery
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Bad Request',
        message: expect.stringContaining('100글자'),
        timestamp: expect.any(String)
      });
    });
  });
});