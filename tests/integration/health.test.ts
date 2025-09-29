/**
 * @fileoverview Health 엔드포인트 통합 테스트
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import app from '../../src/app';

describe('Health API Integration Tests', () => {
  describe('GET /health', () => {
    it('헬스체크 엔드포인트가 정상 응답해야 한다', async () => {
      const response = await request(app)
        .get('/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({
        status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
        uptime: expect.any(Number),
        timestamp: expect.any(String),
        version: '1.0.0',
        environment: 'test',
        services: expect.objectContaining({
          database: expect.stringMatching(/^(up|down|unknown)$/),
          redis: expect.stringMatching(/^(up|down|unknown)$/),
          kakaoApi: expect.stringMatching(/^(up|down|unknown)$/)
        }),
        system: expect.objectContaining({
          memory: expect.objectContaining({
            used: expect.any(Number),
            total: expect.any(Number),
            percentage: expect.any(Number)
          }),
          cpu: expect.objectContaining({
            usage: expect.any(Number)
          })
        })
      });
    });

    it('uptime이 0 이상이어야 한다', async () => {
      const response = await request(app).get('/health');

      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('메모리 사용률이 유효한 범위여야 한다', async () => {
      const response = await request(app).get('/health');

      const memory = response.body.system.memory;
      expect(memory.percentage).toBeGreaterThanOrEqual(0);
      expect(memory.percentage).toBeLessThanOrEqual(100);
      expect(memory.used).toBeGreaterThan(0);
      expect(memory.total).toBeGreaterThan(0);
    });

    it('타임스탬프가 유효한 ISO 날짜 형식이어야 한다', async () => {
      const response = await request(app).get('/health');

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.toISOString()).toBe(response.body.timestamp);
    });

    it('서비스 상태가 유효한 값이어야 한다', async () => {
      const response = await request(app).get('/health');

      const services = response.body.services;
      expect(['up', 'down', 'unknown']).toContain(services.database);
      expect(['up', 'down', 'unknown']).toContain(services.redis);
      expect(['up', 'down', 'unknown']).toContain(services.kakaoApi);
    });

    it('CPU 사용률이 유효한 범위여야 한다', async () => {
      const response = await request(app).get('/health');

      const cpuUsage = response.body.system.cpu.usage;
      expect(cpuUsage).toBeGreaterThanOrEqual(0);
      expect(cpuUsage).toBeLessThanOrEqual(100);
    });
  });
});