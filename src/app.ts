// Load environment variables FIRST
import { config } from 'dotenv';
config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from '@/config/swagger.js';
import { errorHandler } from '@/middleware/errorHandler.js';
import { rateLimiter } from '@/middleware/rateLimiter.js';
import { requestLogger } from '@/middleware/requestLogger.js';
import { securityHeaders } from '@/middleware/security.js';
import { healthRouter } from '@/routes/health.js';
import { meetingsRouter } from '@/routes/meetings.js';
import { placesRouter } from '@/routes/places.js';
import { votingsRouter } from '@/routes/votings.js';
import { kakaoRouter } from '@/routes/kakao.js';
import { naverRouter } from '@/routes/naver.js';
import { meetingPointRouter } from '@/routes/meeting-point.js';
import { logger } from '@/utils/logger.js';
import { serverConfig, corsConfig, logConfigInfo } from '@/config/index.js';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://dapi.kakao.com', 'https://naveropenapi.apigw.ntruss.com']
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = corsConfig.origins;

    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) {return callback(null, true);}

    // Check if origin is allowed
    if (allowedOrigins.includes(origin) ||
        allowedOrigins.some(allowed => {
          if (allowed.includes('localhost')) {
            return new RegExp('^http://localhost:\\d+$').test(origin);
          }
          return false;
        })) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Request-ID',
    'X-Device-ID'
  ],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// General middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}
app.use(requestLogger);

// Security headers
app.use(securityHeaders);

// Rate limiting (only if enabled)
if (process.env.ENABLE_RATE_LIMITING === 'true') {
  app.use(rateLimiter);
}

// Swagger API Documentation (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'MeetHere API Documentation',
    swaggerOptions: {
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
    },
  }));

  // API spec JSON endpoint
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

// API routes
app.use('/health', healthRouter);
app.use('/api/v1/meetings', meetingsRouter);
app.use('/api/v1/places', placesRouter);
app.use('/api/v1/votings', votingsRouter);
app.use('/api/v1/kakao', kakaoRouter);
app.use('/api/v1/naver', naverRouter);
app.use('/api/v1/meeting-point', meetingPointRouter);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use(errorHandler);

// Start server
if (!serverConfig.isTest) {
  app.listen(serverConfig.port, () => {
    logger.info(`🚀 MeetHere API Server running on port ${serverConfig.port}`);
    logConfigInfo();
  });
}

export default app;
