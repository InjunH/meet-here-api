import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { getRedisClient } from '@/utils/redis.js';
import { logger } from '@/utils/logger.js';
import type { Server as HttpServer } from 'http';
import type { CorsOptions } from 'cors';

/**
 * Socket.io 서버 설정 및 초기화
 *
 * @param httpServer - HTTP 서버 인스턴스
 * @param corsOptions - CORS 설정 옵션
 * @returns Socket.io 서버와 네임스페이스 객체
 */
export function setupSocketServer(httpServer: HttpServer, corsOptions: CorsOptions) {
  logger.info('Setting up Socket.io server...');

  // Socket.io 서버 생성
  const io = new Server(httpServer, {
    cors: corsOptions,
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Redis Adapter 설정 (다중 서버 지원)
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const pubClient = redisClient;
      const subClient = pubClient.duplicate();

      io.adapter(createAdapter(pubClient, subClient));
      logger.info('✅ Socket.io Redis adapter configured');
    } catch (error) {
      logger.error('Failed to configure Redis adapter', {
        error: (error as Error).message
      });
      logger.warn('⚠️  Socket.io running without Redis adapter (single server mode)');
    }
  } else {
    logger.warn('⚠️  Redis not available - Socket.io running in single server mode');
  }

  // 미팅 전용 네임스페이스 생성
  const meetingNamespace = io.of('/meetings');

  // 연결 로깅
  meetingNamespace.on('connection', (socket) => {
    logger.info('Client connected to /meetings namespace', {
      socketId: socket.id,
      transport: socket.conn.transport.name
    });

    socket.on('disconnect', (reason) => {
      logger.info('Client disconnected from /meetings namespace', {
        socketId: socket.id,
        reason
      });
    });
  });

  logger.info('Socket.io server setup complete');

  return { io, meetingNamespace };
}
