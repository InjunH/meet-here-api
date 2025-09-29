/**
 * @fileoverview Meeting Point API 엔드포인트 통합 테스트
 */

import request from 'supertest';
import { describe, it, expect, beforeEach } from '@jest/globals';
import app from '../../src/app';
import { TEST_COORDINATES } from '../helpers/test-data';

describe('Meeting Point API Integration Tests', () => {
  describe('POST /api/v1/meeting-point/calculate', () => {
    it('여러 위치의 중간지점을 계산하여 반환해야 한다', async () => {
      const locations = [
        { name: '강남역', ...TEST_COORDINATES.GANGNAM_STATION },
        { name: '서울역', ...TEST_COORDINATES.SEOUL_STATION },
        { name: '홍대입구', ...TEST_COORDINATES.HONGDAE }
      ];

      const response = await request(app)
        .post('/api/v1/meeting-point/calculate')
        .send({
          locations,
          preference: 'center'
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          centerPoint: expect.objectContaining({
            lat: expect.any(Number),
            lng: expect.any(Number)
          }),
          bounds: expect.objectContaining({
            northeast: expect.objectContaining({
              lat: expect.any(Number),
              lng: expect.any(Number)
            }),
            southwest: expect.objectContaining({
              lat: expect.any(Number),
              lng: expect.any(Number)
            })
          }),
          totalDistance: expect.any(Number),
          averageDistance: expect.any(Number)
        },
        timestamp: expect.any(String)
      });

      // 중간지점이 유효한 좌표 범위 내에 있는지 확인
      const centerPoint = response.body.data.centerPoint;
      expect(centerPoint.lat).toBeGreaterThan(33);
      expect(centerPoint.lat).toBeLessThan(43);
      expect(centerPoint.lng).toBeGreaterThan(124);
      expect(centerPoint.lng).toBeLessThan(132);
    });

    it('2개 위치의 중간지점을 계산하여 반환해야 한다', async () => {
      const locations = [
        { name: '강남역', ...TEST_COORDINATES.GANGNAM_STATION },
        { name: '서울역', ...TEST_COORDINATES.SEOUL_STATION }
      ];

      const response = await request(app)
        .post('/api/v1/meeting-point/calculate')
        .send({
          locations,
          preference: 'center'
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.centerPoint).toEqual({
        lat: expect.any(Number),
        lng: expect.any(Number)
      });
    });

    it('가중 중간지점 계산 요청 시 가중치가 적용된 결과를 반환해야 한다', async () => {
      const locations = [
        { name: '강남역', ...TEST_COORDINATES.GANGNAM_STATION, weight: 2 },
        { name: '서울역', ...TEST_COORDINATES.SEOUL_STATION, weight: 1 }
      ];

      const response = await request(app)
        .post('/api/v1/meeting-point/calculate')
        .send({
          locations,
          preference: 'weighted',
          weights: [2, 1]
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: expect.objectContaining({
          centerPoint: expect.objectContaining({
            lat: expect.any(Number),
            lng: expect.any(Number)
          }),
          weightedCenter: true
        }),
        timestamp: expect.any(String)
      });
    });

    it('1개 위치만 제공된 경우 400 에러를 반환해야 한다', async () => {
      const locations = [
        { name: '강남역', ...TEST_COORDINATES.GANGNAM_STATION }
      ];

      const response = await request(app)
        .post('/api/v1/meeting-point/calculate')
        .send({
          locations,
          preference: 'center'
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Bad Request',
        message: expect.stringContaining('2개 이상'),
        errorCode: 'VALIDATION_ERROR',
        timestamp: expect.any(String)
      });
    });

    it('잘못된 좌표가 포함된 경우 400 에러를 반환해야 한다', async () => {
      const locations = [
        { name: '강남역', ...TEST_COORDINATES.GANGNAM_STATION },
        { name: '잘못된위치', lat: 'invalid', lng: 127.0276 }
      ];

      const response = await request(app)
        .post('/api/v1/meeting-point/calculate')
        .send({
          locations,
          preference: 'center'
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

    it('최대 위치 개수를 초과한 경우 400 에러를 반환해야 한다', async () => {
      const locations = Array.from({ length: 21 }, (_, i) => ({
        name: `위치${i + 1}`,
        lat: 37.5 + (i * 0.01),
        lng: 127.0 + (i * 0.01)
      }));

      const response = await request(app)
        .post('/api/v1/meeting-point/calculate')
        .send({
          locations,
          preference: 'center'
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Bad Request',
        message: expect.stringContaining('최대'),
        errorCode: 'VALIDATION_ERROR',
        timestamp: expect.any(String)
      });
    });

    it('필수 파라미터가 누락된 경우 400 에러를 반환해야 한다', async () => {
      const response = await request(app)
        .post('/api/v1/meeting-point/calculate')
        .send({
          // locations 누락
          preference: 'center'
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
    });
  });

  describe('POST /api/v1/meeting-point/optimize', () => {
    it('접근성을 고려한 최적화된 중간지점을 반환해야 한다', async () => {
      const locations = [
        { name: '강남역', ...TEST_COORDINATES.GANGNAM_STATION },
        { name: '서울역', ...TEST_COORDINATES.SEOUL_STATION },
        { name: '홍대입구', ...TEST_COORDINATES.HONGDAE }
      ];

      const response = await request(app)
        .post('/api/v1/meeting-point/optimize')
        .send({
          locations,
          optimizationCriteria: 'subway_access'
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          optimizedPoint: expect.objectContaining({
            lat: expect.any(Number),
            lng: expect.any(Number)
          }),
          nearestSubwayStation: expect.objectContaining({
            name: expect.any(String),
            line: expect.any(String),
            distance: expect.any(Number)
          }),
          accessibilityScore: expect.any(Number),
          totalTravelTime: expect.any(Number)
        },
        timestamp: expect.any(String)
      });
    });

    it('대중교통 접근성 점수가 유효한 범위여야 한다', async () => {
      const locations = [
        { name: '강남역', ...TEST_COORDINATES.GANGNAM_STATION },
        { name: '서울역', ...TEST_COORDINATES.SEOUL_STATION }
      ];

      const response = await request(app)
        .post('/api/v1/meeting-point/optimize')
        .send({
          locations,
          optimizationCriteria: 'subway_access'
        })
        .expect(200);

      const accessibilityScore = response.body.data.accessibilityScore;
      expect(accessibilityScore).toBeGreaterThanOrEqual(0);
      expect(accessibilityScore).toBeLessThanOrEqual(100);
    });

    it('잘못된 최적화 기준으로 요청 시 400 에러를 반환해야 한다', async () => {
      const locations = [
        { name: '강남역', ...TEST_COORDINATES.GANGNAM_STATION },
        { name: '서울역', ...TEST_COORDINATES.SEOUL_STATION }
      ];

      const response = await request(app)
        .post('/api/v1/meeting-point/optimize')
        .send({
          locations,
          optimizationCriteria: 'invalid_criteria'
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Bad Request',
        message: expect.stringContaining('최적화 기준'),
        errorCode: 'VALIDATION_ERROR',
        timestamp: expect.any(String)
      });
    });
  });
});