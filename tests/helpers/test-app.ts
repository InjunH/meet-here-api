/**
 * @fileoverview 테스트용 Express 앱 설정
 * 통합 테스트에서 사용할 Express 앱 인스턴스 생성
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimiter } from '@/middleware/rateLimiter.js';
import { requestLogger } from '@/middleware/requestLogger.js';
import { errorHandler } from '@/middleware/errorHandler.js';

// 테스트용 라우터들
import { healthRouter } from '@/routes/health.js';
import { naverRouter } from '@/routes/naver.js';
import { kakaoRouter } from '@/routes/kakao.js';

/**
 * 테스트용 Express 애플리케이션 생성
 */
export function createTestApp(): express.Application {
  const app = express();

  // 미들웨어 설정
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
  }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 테스트 환경에서는 Rate Limiting 완화
  if (process.env.NODE_ENV === 'test') {
    app.use(rateLimiter);
  }

  // 요청 로깅 (테스트 환경에서는 silent)
  if (process.env.NODE_ENV !== 'test') {
    app.use(requestLogger);
  }

  // 라우터 설정
  app.use('/health', healthRouter);
  app.use('/api/v1/naver', naverRouter);
  app.use('/api/v1/kakao', kakaoRouter);

  // 404 핸들러
  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      timestamp: new Date().toISOString()
    });
  });

  // 에러 핸들러
  app.use(errorHandler);

  return app;
}