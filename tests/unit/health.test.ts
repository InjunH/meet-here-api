import request from 'supertest';
import app from '../../src/app';

// Add expect matchers
expect.extend({
  toBeOneOf(received, expected) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected}`,
        pass: false,
      };
    }
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: any[]): R;
    }
  }
}

describe('Health Routes', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toMatchObject({
        status: expect.any(String),
        timestamp: expect.any(String),
        version: expect.any(String),
        environment: expect.any(String),
        uptime: expect.any(Number)
      });
      
      expect(['healthy', 'degraded', 'unhealthy']).toContain(response.body.status);
    });
  });
  
  describe('GET /health/live', () => {
    it('should return liveness probe', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);
      
      expect(response.body).toMatchObject({
        status: 'alive',
        timestamp: expect.any(String)
      });
    });
  });
  
  describe('GET /health/ready', () => {
    it('should return readiness probe', async () => {
      const response = await request(app)
        .get('/health/ready');
      
      expect(response.status).toBeOneOf([200, 503]);
      
      expect(response.body).toMatchObject({
        status: expect.any(String),
        timestamp: expect.any(String),
        services: expect.any(Object)
      });
    });
  });
});