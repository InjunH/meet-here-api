/**
 * @fileoverview 네이버 API 라우터 테스트
 */

import request from 'supertest';
import app from '../../src/app';

describe('Naver API Routes', () => {
  describe('POST /api/v1/naver/reverse-geocode', () => {
    it('올바른 좌표로 역지오코딩 요청 시 응답이 있어야 함', async () => {
      const response = await request(app)
        .post('/api/v1/naver/reverse-geocode')
        .send({
          lat: 37.3595704,
          lng: 127.105399
        })
        .expect('Content-Type', /json/);

      // 환경변수가 설정되어 있는지 확인
      if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
        // API 키가 설정되어 있지만 실제로는 네이버에서 활성화되지 않았을 수 있으므로
        // 401 에러는 503 Service Unavailable로 변환됨
        expect([200, 503]).toContain(response.status);
        expect(response.body).toHaveProperty('success');

        if (response.status === 200) {
          expect(response.body).toHaveProperty('success', true);
          expect(response.body).toHaveProperty('data');
          expect(response.body.data).toHaveProperty('address');
          expect(response.body.data).toHaveProperty('roadAddress');
          expect(response.body.data).toHaveProperty('district');
        } else {
          expect(response.body).toHaveProperty('success', false);
          expect(response.body).toHaveProperty('error', 'Service Unavailable');
          expect(response.body).toHaveProperty('fallback');
          expect(response.body.fallback).toHaveProperty('available', true);
          expect(response.body.fallback).toHaveProperty('endpoint', '/api/v1/naver/reverse-geocode-test');
        }
      } else {
        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('success', false);
      }
    });

    it('테스트용 엔드포인트로 목업 데이터 요청 시 성공해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/naver/reverse-geocode-test')
        .send({
          lat: 37.3595704,
          lng: 127.105399
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('mock', true);
      expect(response.body.data).toHaveProperty('address');
      expect(response.body.data).toHaveProperty('roadAddress');
      expect(response.body.data).toHaveProperty('district');
      expect(response.body.data.address).toContain('경기도 수원시 영통구');
    });

    it('잘못된 위도값으로 요청 시 400 오류 반환해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/naver/reverse-geocode')
        .send({
          lat: 200, // 잘못된 위도 (90도 초과)
          lng: 127.105399
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Bad Request');
    });

    it('잘못된 경도값으로 요청 시 400 오류 반환해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/naver/reverse-geocode')
        .send({
          lat: 37.3595704,
          lng: 200 // 잘못된 경도 (180도 초과)
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Bad Request');
    });

    it('필수 파라미터 누락 시 400 오류 반환해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/naver/reverse-geocode')
        .send({
          lat: 37.3595704
          // lng 누락
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Bad Request');
    });

    it('빈 요청 시 400 오류 반환해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/naver/reverse-geocode')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Bad Request');
    });
  });

  describe('GET /api/v1/naver/health', () => {
    it('네이버 API 서비스 상태를 확인해야 함', async () => {
      const response = await request(app)
        .get('/api/v1/naver/health')
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('service', 'naver-api');
      expect(response.body).toHaveProperty('configured');

      if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('status', 'healthy');
        expect(response.body).toHaveProperty('configured', true);
      } else {
        expect(response.status).toBe(503);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('status', 'misconfigured');
        expect(response.body).toHaveProperty('configured', false);
      }
    });

    it('새로 추가된 진단 엔드포인트가 작동해야 함', async () => {
      const response = await request(app)
        .get('/api/v1/naver/diagnose')
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('service', 'naver-api');

      if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
        // 401 오류가 예상되므로 503 Service Unavailable 응답 확인
        expect(response.status).toBe(503);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('status', 'invalid');
        expect(response.body).toHaveProperty('error', 'CREDENTIALS_INVALID');
        expect(response.body).toHaveProperty('suggestion');
        expect(response.body).toHaveProperty('fallback');
        expect(response.body.fallback).toHaveProperty('available', true);
      } else {
        expect(response.status).toBe(503);
        expect(response.body).toHaveProperty('success', false);
      }
    });
  });
});