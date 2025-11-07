/**
 * @fileoverview 세션 관리 서비스
 * 하이브리드 아키텍처: Redis (실시간) + PostgreSQL (영구 저장)
 */

import { db } from '@/db/connection.js';
import { sessions, participants as participantsTable, type NewSession, type Session } from '@/db/schema.js';
import { redisSessionManager, type RedisSessionData } from '@/utils/redis-helper.js';
import { logger } from '@/utils/logger.js';
import { AppError } from '@/middleware/errorHandler.js';
import { eq } from 'drizzle-orm';
import { emitSessionStatusChanged } from '@/socket/emitter.js';

/**
 * 세션 생성 요청
 */
export interface CreateSessionRequest {
  title: string;
  hostName: string;
}

/**
 * 세션 업데이트 요청
 */
export interface UpdateSessionRequest {
  status?: 'active' | 'voting' | 'completed' | 'cancelled';
  centerLat?: string;
  centerLng?: string;
  centerDisplayName?: string;
  selectedPlaceId?: string;
}

/**
 * 세션 응답 (Redis + DB 통합)
 */
export interface SessionResponse {
  id: string;
  title: string;
  hostName: string;
  status: 'active' | 'voting' | 'completed' | 'cancelled';
  centerPoint?: {
    lat: string;
    lng: string;
  };
  centerDisplayName?: string;
  selectedPlaceId?: string;
  createdAt: string;
  expiresAt: string;
  participantCount?: number;
}

/**
 * 세션 관리 서비스
 */
export class SessionService {
  /**
   * 세션 생성
   */
  async createSession(request: CreateSessionRequest): Promise<SessionResponse> {
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24시간 후

    // Redis에 캐시 (실시간 접근용)
    const redisData: RedisSessionData = {
      id: sessionId,
      title: request.title,
      hostName: request.hostName,
      status: 'active',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    try {
      await redisSessionManager.setSession(sessionId, redisData);
    } catch (error) {
      logger.error('Failed to cache session in Redis', {
        error: (error as Error).message,
        sessionId,
      });
      // Redis 캐싱 실패는 치명적이므로 에러 throw
      throw new AppError(
        '세션 생성에 실패했습니다 (Redis 오류)',
        500,
        'SESSION_CREATE_ERROR',
        true,
        { request }
      );
    }

    // PostgreSQL에 영구 저장 (DB 사용 가능한 경우만, 실패해도 계속 진행)
    if (db) {
      try {
        const dbData: NewSession = {
          id: sessionId,
          title: request.title,
          hostName: request.hostName,
          status: 'active',
          expiresAt,
        };

        await db.insert(sessions).values(dbData);
        logger.info('Session saved to database', { sessionId });
      } catch (dbError) {
        // DB 저장 실패는 로깅만 하고 계속 진행 (Redis가 Primary)
        logger.warn('Failed to save session to database - continuing with Redis only', {
          error: (dbError as Error).message,
          sessionId,
        });
      }
    } else {
      logger.warn('Database not available - session only in Redis', { sessionId });
    }

    logger.info('Session created', {
      sessionId,
      title: request.title,
      hostName: request.hostName,
    });

    return {
      id: sessionId,
      title: request.title,
      hostName: request.hostName,
      status: 'active',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * 세션 조회 (Redis 우선, DB fallback)
   */
  async getSession(sessionId: string): Promise<SessionResponse | null> {
    try {
      // 1. Redis에서 먼저 조회 (빠름)
      const redisData = await redisSessionManager.getSession(sessionId);

      if (redisData) {
        logger.debug('Session found in Redis', { sessionId });

        return {
          id: redisData.id,
          title: redisData.title,
          hostName: redisData.hostName,
          status: redisData.status,
          centerPoint: redisData.centerLat && redisData.centerLng
            ? { lat: redisData.centerLat, lng: redisData.centerLng }
            : undefined,
          centerDisplayName: redisData.centerDisplayName,
          selectedPlaceId: redisData.selectedPlaceId,
          createdAt: redisData.createdAt,
          expiresAt: redisData.expiresAt,
        };
      }

      // 2. Redis에 없으면 DB에서 조회 (fallback)
      if (db) {
        const dbData = await db.query.sessions.findFirst({
          where: eq(sessions.id, sessionId),
        });

        if (dbData) {
          logger.debug('Session found in database', { sessionId });

          // Redis에 다시 캐시
          const redisData: RedisSessionData = {
            id: dbData.id,
            title: dbData.title,
            hostName: dbData.hostName,
            status: dbData.status as 'active' | 'voting' | 'completed' | 'cancelled',
            centerLat: dbData.centerLat || undefined,
            centerLng: dbData.centerLng || undefined,
            centerDisplayName: dbData.centerDisplayName || undefined,
            selectedPlaceId: dbData.selectedPlaceId || undefined,
            createdAt: dbData.createdAt.toISOString(),
            expiresAt: dbData.expiresAt.toISOString(),
          };

          await redisSessionManager.setSession(sessionId, redisData);

          return {
            id: dbData.id,
            title: dbData.title,
            hostName: dbData.hostName,
            status: dbData.status as 'active' | 'voting' | 'completed' | 'cancelled',
            centerPoint: dbData.centerLat && dbData.centerLng
              ? { lat: dbData.centerLat, lng: dbData.centerLng }
              : undefined,
            centerDisplayName: dbData.centerDisplayName || undefined,
            selectedPlaceId: dbData.selectedPlaceId || undefined,
            createdAt: dbData.createdAt.toISOString(),
            expiresAt: dbData.expiresAt.toISOString(),
          };
        }
      }

      // 3. 어디에도 없음
      logger.warn('Session not found', { sessionId });
      return null;
    } catch (error) {
      logger.error('Failed to get session', {
        sessionId,
        error: (error as Error).message,
      });

      throw new AppError(
        '세션 조회에 실패했습니다',
        500,
        'SESSION_GET_ERROR',
        true,
        { sessionId }
      );
    }
  }

  /**
   * 세션 업데이트
   */
  async updateSession(sessionId: string, updates: UpdateSessionRequest): Promise<SessionResponse> {
    try {
      // 기존 세션 조회
      const existing = await this.getSession(sessionId);

      if (!existing) {
        throw new AppError(
          '세션을 찾을 수 없습니다',
          404,
          'SESSION_NOT_FOUND',
          false,
          { sessionId }
        );
      }

      // Redis 업데이트
      const updatedRedisData: RedisSessionData = {
        id: existing.id,
        title: existing.title,
        hostName: existing.hostName,
        status: updates.status || existing.status,
        centerLat: updates.centerLat || existing.centerPoint?.lat,
        centerLng: updates.centerLng || existing.centerPoint?.lng,
        centerDisplayName: updates.centerDisplayName || existing.centerDisplayName,
        selectedPlaceId: updates.selectedPlaceId || existing.selectedPlaceId,
        createdAt: existing.createdAt,
        expiresAt: existing.expiresAt,
      };

      await redisSessionManager.setSession(sessionId, updatedRedisData);

      // DB 업데이트 (사용 가능한 경우)
      if (db) {
        const dbUpdates: Partial<Session> = {};

        if (updates.status) dbUpdates.status = updates.status;
        if (updates.centerLat) dbUpdates.centerLat = updates.centerLat;
        if (updates.centerLng) dbUpdates.centerLng = updates.centerLng;
        if (updates.centerDisplayName) dbUpdates.centerDisplayName = updates.centerDisplayName;
        if (updates.selectedPlaceId) dbUpdates.selectedPlaceId = updates.selectedPlaceId;

        if (updates.status === 'completed') {
          dbUpdates.completedAt = new Date();
        }

        await db.update(sessions)
          .set(dbUpdates)
          .where(eq(sessions.id, sessionId));

        logger.info('Session updated in database', { sessionId, updates });
      }

      logger.info('Session updated', { sessionId, updates });

      // Socket.io 세션 상태 변경 실시간 이벤트 (상태 변경 시에만)
      if (updates.status) {
        try {
          emitSessionStatusChanged(sessionId, updates.status);
        } catch (socketError) {
          // Socket 이벤트 실패는 로깅만 하고 에러로 처리하지 않음
          logger.warn('Failed to emit session status change socket event', {
            error: (socketError as Error).message,
            sessionId,
            status: updates.status,
          });
        }
      }

      return {
        id: updatedRedisData.id,
        title: updatedRedisData.title,
        hostName: updatedRedisData.hostName,
        status: updatedRedisData.status,
        centerPoint: updatedRedisData.centerLat && updatedRedisData.centerLng
          ? { lat: updatedRedisData.centerLat, lng: updatedRedisData.centerLng }
          : undefined,
        centerDisplayName: updatedRedisData.centerDisplayName,
        selectedPlaceId: updatedRedisData.selectedPlaceId,
        createdAt: updatedRedisData.createdAt,
        expiresAt: updatedRedisData.expiresAt,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;

      logger.error('Failed to update session', {
        sessionId,
        updates,
        error: (error as Error).message,
      });

      throw new AppError(
        '세션 업데이트에 실패했습니다',
        500,
        'SESSION_UPDATE_ERROR',
        true,
        { sessionId, updates }
      );
    }
  }

  /**
   * 세션 완료 처리
   */
  async completeSession(sessionId: string, selectedPlaceId?: string): Promise<SessionResponse> {
    return this.updateSession(sessionId, {
      status: 'completed',
      selectedPlaceId,
    });
  }

  /**
   * 세션 삭제 (관리자 전용)
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      // 참가자 ID 목록 조회 (Redis 정리용)
      const participants = await redisSessionManager.getParticipants(sessionId);
      const participantIds = Object.keys(participants);

      // Redis 데이터 삭제
      await redisSessionManager.deleteSession(sessionId, participantIds);

      // DB에서 삭제 (cascade로 참가자, 장소, 투표도 자동 삭제)
      if (db) {
        await db.delete(sessions).where(eq(sessions.id, sessionId));
        logger.info('Session deleted from database', { sessionId });
      }

      logger.info('Session deleted', { sessionId });
    } catch (error) {
      logger.error('Failed to delete session', {
        sessionId,
        error: (error as Error).message,
      });

      throw new AppError(
        '세션 삭제에 실패했습니다',
        500,
        'SESSION_DELETE_ERROR',
        true,
        { sessionId }
      );
    }
  }
}

// 싱글톤 인스턴스
export const sessionService = new SessionService();
