import { Router, Request, Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler.js';
import { logger } from '@/utils/logger.js';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  services: {
    database: 'up' | 'down' | 'unknown';
    redis: 'up' | 'down' | 'unknown';
    kakaoApi: 'up' | 'down' | 'unknown';
  };
  system: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
  };
}

/**
 * @swagger
 * /health:
 *   get:
 *     summary: 시스템 전체 헬스 체크
 *     description: 서버 상태, 서비스 상태, 시스템 리소스 정보를 포함한 전체적인 헬스체크를 수행합니다.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 헬스체크 성공 (정상 또는 일부 문제)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, unhealthy, degraded]
 *                   description: 전체 서비스 상태
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: 응답 시각
 *                 version:
 *                   type: string
 *                   description: API 버전
 *                 environment:
 *                   type: string
 *                   description: 실행 환경
 *                 uptime:
 *                   type: number
 *                   description: 서버 업타임 (초)
 *                 services:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       enum: [up, down, unknown]
 *                     redis:
 *                       type: string
 *                       enum: [up, down, unknown]
 *                     kakaoApi:
 *                       type: string
 *                       enum: [up, down, unknown]
 *                 system:
 *                   type: object
 *                   properties:
 *                     memory:
 *                       type: object
 *                       properties:
 *                         used:
 *                           type: number
 *                           description: 사용 메모리 (MB)
 *                         total:
 *                           type: number
 *                           description: 전체 메모리 (MB)
 *                         percentage:
 *                           type: number
 *                           description: 메모리 사용률 (%)
 *                     cpu:
 *                       type: object
 *                       properties:
 *                         usage:
 *                           type: number
 *                           description: CPU 사용률 (%)
 *       503:
 *         description: 서비스 상태 불량
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// Basic health check
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const startTime = process.hrtime();

  try {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal;
    const usedMemory = memUsage.heapUsed;
    const memoryPercentage = Math.round((usedMemory / totalMemory) * 100);

    // Check services status
    const services = {
      database: await checkDatabase(),
      redis: await checkRedis(),
      kakaoApi: await checkKakaoApi()
    };

    // Determine overall status
    const hasDownService = Object.values(services).includes('down');
    const hasUnknownService = Object.values(services).includes('unknown');

    let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    if (hasDownService) {
      status = 'unhealthy';
    } else if (hasUnknownService) {
      status = 'degraded';
    }

    const healthStatus: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.floor(process.uptime()),
      services,
      system: {
        memory: {
          used: Math.round(usedMemory / 1024 / 1024), // MB
          total: Math.round(totalMemory / 1024 / 1024), // MB
          percentage: memoryPercentage
        },
        cpu: {
          usage: await getCpuUsage()
        }
      }
    };

    // Log health check with response time
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const responseTime = seconds * 1000 + nanoseconds / 1000000;

    logger.info('Health check performed', {
      status,
      responseTime: `${responseTime.toFixed(2)}ms`,
      services
    });

    const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
    res.status(httpStatus).json(healthStatus);

  } catch (error) {
    logger.error('Health check failed', { error: (error as Error).message });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: (error as Error).message
    });
  }
}));

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: 서버 생존 확인
 *     description: 간단한 liveness probe로 서버가 살아있는지 확인합니다.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 서버 생존 상태
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [alive]
 *                   description: 생존 상태
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: 응답 시각
 */
// Simple liveness probe
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: 서버 준비 상태 확인
 *     description: readiness probe로 서버가 요청을 처리할 준비가 되어있는지 확인합니다.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 서버 준비 완료
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ready]
 *                   description: 준비 상태
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: 응답 시각
 *                 services:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       enum: [up, down, unknown]
 *                     redis:
 *                       type: string
 *                       enum: [up, down, unknown]
 *       503:
 *         description: 서버 준비 미완료
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [not_ready]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 services:
 *                   type: object
 *                   description: 각 서비스별 상태
 */
// Readiness probe
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  const services = {
    database: await checkDatabase(),
    redis: await checkRedis()
  };

  const isReady = Object.values(services).every(status => status === 'up');

  if (isReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      services
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      services
    });
  }
}));

// Helper functions
async function checkDatabase(): Promise<'up' | 'down' | 'unknown'> {
  try {
    // Basic database connectivity check
    // This would be implemented based on your database setup
    return 'unknown'; // Default for now
    // eslint-disable-next-line no-unreachable
  } catch (error) {
    logger.error('Database health check failed', { error: (error as Error).message });
    return 'down';
  }
}

async function checkRedis(): Promise<'up' | 'down' | 'unknown'> {
  try {
    if (process.env.ENABLE_REDIS_CACHE !== 'true') {
      return 'unknown';
    }
    // Redis connectivity check would be implemented here
    return 'unknown'; // Default for now
  } catch (error) {
    logger.error('Redis health check failed', { error: (error as Error).message });
    return 'down';
  }
}

async function checkKakaoApi(): Promise<'up' | 'down' | 'unknown'> {
  try {
    if (!process.env.KAKAO_API_KEY) {
      return 'unknown';
    }
    // Kakao API connectivity check would be implemented here
    return 'unknown'; // Default for now
  } catch (error) {
    logger.error('Kakao API health check failed', { error: (error as Error).message });
    return 'down';
  }
}

async function getCpuUsage(): Promise<number> {
  return new Promise((resolve) => {
    const startUsage = process.cpuUsage();
    setTimeout(() => {
      const endUsage = process.cpuUsage(startUsage);
      const userUsage = endUsage.user / 1000000; // Convert microseconds to seconds
      const systemUsage = endUsage.system / 1000000;
      const totalUsage = userUsage + systemUsage;
      const percentage = Math.round((totalUsage / 1) * 100); // Approximate percentage
      resolve(Math.min(percentage, 100));
    }, 100);
  });
}

export { router as healthRouter };
