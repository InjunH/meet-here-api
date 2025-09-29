/**
 * @fileoverview 중앙집중화된 환경변수 설정 관리
 */

import { configSchema, validateRequiredEnvVars, type Config } from './schema.js';

/**
 * 환경변수 파싱 및 검증
 */
const parseConfig = (): Config => {
  try {
    // 환경변수 파싱 및 기본 검증
    const config = configSchema.parse(process.env);

    // 환경별 필수 변수 검증
    validateRequiredEnvVars(config);

    return config;
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ 환경변수 설정 오류:', error.message);

      // 개발 환경에서는 더 자세한 정보 제공
      if (process.env.NODE_ENV === 'development') {
        console.error('상세 오류:', error);
      }
    }

    process.exit(1);
  }
};

/**
 * 검증된 설정 객체
 */
export const config = parseConfig();

/**
 * 설정 카테고리별 접근자
 */
export const serverConfig = {
  nodeEnv: config.NODE_ENV,
  port: config.PORT,
  isDevelopment: config.NODE_ENV === 'development',
  isProduction: config.NODE_ENV === 'production',
  isTest: config.NODE_ENV === 'test',
} as const;

export const databaseConfig = {
  url: config.DATABASE_URL,
  redis: {
    url: config.REDIS_URL,
    enabled: config.ENABLE_REDIS_CACHE,
  },
  aws: {
    region: config.AWS_REGION,
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    dynamodb: {
      tableName: config.DYNAMODB_TABLE_NAME,
      endpoint: config.DYNAMODB_ENDPOINT,
    },
  },
} as const;

export const apiConfig = {
  kakao: {
    apiKey: config.KAKAO_API_KEY,
    adminKey: config.KAKAO_ADMIN_KEY,
  },
  naver: {
    // 클라우드 플랫폼 (Reverse Geocoding)
    cloud: {
      clientId: config.NAVER_CLIENT_ID,
      clientSecret: config.NAVER_CLIENT_SECRET,
    },
    // 개발자센터 (Local Search)
    search: {
      clientId: config.NAVER_SEARCH_CLIENT_ID,
      clientSecret: config.NAVER_SEARCH_CLIENT_SECRET,
    },
  },
} as const;

export const authConfig = {
  jwt: {
    secret: config.JWT_SECRET,
    expiresIn: config.JWT_EXPIRES_IN,
    refreshExpiresIn: config.JWT_REFRESH_EXPIRES_IN,
  },
} as const;

export const rateLimitConfig = {
  enabled: config.ENABLE_RATE_LIMITING,
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  maxRequests: config.RATE_LIMIT_MAX_REQUESTS,
  maxRequestsAuth: config.RATE_LIMIT_MAX_REQUESTS_AUTH,
} as const;

export const corsConfig = {
  origins: config.CORS_ORIGIN.split(',').map(origin => origin.trim()),
} as const;

export const loggingConfig = {
  level: config.LOG_LEVEL,
  filePath: config.LOG_FILE_PATH,
  requestLogging: config.ENABLE_REQUEST_LOGGING,
} as const;

export const monitoringConfig = {
  enabled: config.ENABLE_METRICS,
  healthEndpoint: config.HEALTH_CHECK_ENDPOINT,
  metricsEndpoint: config.METRICS_ENDPOINT,
} as const;

export const securityConfig = {
  validApiKeys: config.VALID_API_KEYS?.split(',').map(key => key.trim()) || [],
} as const;

/**
 * 설정 정보 출력 (민감한 정보 제외)
 */
export const logConfigInfo = (): void => {
  console.log('📋 서버 설정 정보:');
  console.log(`   환경: ${serverConfig.nodeEnv}`);
  console.log(`   포트: ${serverConfig.port}`);
  console.log(`   데이터베이스: ${databaseConfig.url ? '설정됨' : '미설정'}`);
  console.log(`   Redis 캐시: ${databaseConfig.redis.enabled ? '활성화' : '비활성화'}`);
  console.log(`   Rate Limiting: ${rateLimitConfig.enabled ? '활성화' : '비활성화'}`);
  console.log(`   요청 로깅: ${loggingConfig.requestLogging ? '활성화' : '비활성화'}`);
  console.log(`   카카오 API: ${apiConfig.kakao.apiKey ? '설정됨' : '미설정'}`);
  console.log(`   네이버 검색 API: ${apiConfig.naver.search.clientId ? '설정됨' : '미설정'}`);
  console.log(`   네이버 클라우드 API: ${apiConfig.naver.cloud.clientId ? '설정됨' : '미설정'}`);
};