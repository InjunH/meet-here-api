/**
 * @fileoverview 환경변수 검증을 위한 Zod 스키마 정의
 */

import { z } from 'zod';

/**
 * 환경변수 validation 스키마
 */
export const configSchema = z.object({
  // 기본 서버 설정
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(0).max(65535)).default('8090'),

  // 데이터베이스 설정
  DATABASE_URL: z.string().optional(),

  // Redis 설정
  REDIS_URL: z.string().optional(),

  // AWS 설정 (Production용)
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  DYNAMODB_TABLE_NAME: z.string().optional(),
  DYNAMODB_ENDPOINT: z.string().optional(),

  // 외부 API 설정
  KAKAO_API_KEY: z.string().optional(),
  KAKAO_ADMIN_KEY: z.string().optional(),

  // 네이버 클라우드 플랫폼 API (Reverse Geocoding)
  NAVER_CLIENT_ID: z.string().optional(),
  NAVER_CLIENT_SECRET: z.string().optional(),

  // 네이버 개발자센터 API (Local Search)
  NAVER_SEARCH_CLIENT_ID: z.string().optional(),
  NAVER_SEARCH_CLIENT_SECRET: z.string().optional(),

  // 인증 설정
  JWT_SECRET: z.string().min(32, 'JWT_SECRET는 최소 32자 이상이어야 합니다').optional(),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Rate Limiting 설정
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).pipe(z.number().positive()).default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().positive()).default('100'),
  RATE_LIMIT_MAX_REQUESTS_AUTH: z.string().transform(Number).pipe(z.number().positive()).default('1000'),

  // CORS 설정
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:3000'),

  // 로깅 설정
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'silent']).default('debug'),
  LOG_FILE_PATH: z.string().default('./logs/app.log'),

  // 모니터링 설정
  HEALTH_CHECK_ENDPOINT: z.string().default('/health'),
  METRICS_ENDPOINT: z.string().default('/metrics'),

  // 기능 플래그
  ENABLE_REDIS_CACHE: z.string().transform(val => val === 'true').default('false'),
  ENABLE_RATE_LIMITING: z.string().transform(val => val === 'true').default('false'),
  ENABLE_REQUEST_LOGGING: z.string().transform(val => val === 'true').default('true'),
  ENABLE_METRICS: z.string().transform(val => val === 'true').default('false'),

  // API 키 검증
  VALID_API_KEYS: z.string().optional(),
});

/**
 * 환경변수 타입 정의
 */
export type Config = z.infer<typeof configSchema>;

/**
 * 환경별 필수 변수 검증
 */
export const validateRequiredEnvVars = (config: Config): void => {
  const { NODE_ENV } = config;

  // Production 환경에서 필수 변수들
  if (NODE_ENV === 'production') {
    const requiredForProduction = [
      'JWT_SECRET',
      'DATABASE_URL',
    ] as const;

    for (const key of requiredForProduction) {
      if (!config[key]) {
        throw new Error(`${key}는 production 환경에서 필수입니다`);
      }
    }
  }

  // 네이버 API 사용 시 필수 변수들
  if (config.NAVER_SEARCH_CLIENT_ID || config.NAVER_SEARCH_CLIENT_SECRET) {
    if (!config.NAVER_SEARCH_CLIENT_ID || !config.NAVER_SEARCH_CLIENT_SECRET) {
      throw new Error('NAVER_SEARCH_CLIENT_ID와 NAVER_SEARCH_CLIENT_SECRET는 함께 설정되어야 합니다');
    }
  }

  if (config.NAVER_CLIENT_ID || config.NAVER_CLIENT_SECRET) {
    if (!config.NAVER_CLIENT_ID || !config.NAVER_CLIENT_SECRET) {
      throw new Error('NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET는 함께 설정되어야 합니다');
    }
  }
};