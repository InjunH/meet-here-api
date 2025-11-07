/**
 * @fileoverview 참가자 관리 서비스
 * 참가자 추가, 위치 업데이트, 실시간 동기화
 */

import { db } from '@/db/connection.js';
import { participants, type NewParticipant, type Participant } from '@/db/schema.js';
import { redisSessionManager, type RedisParticipantData, type RedisLocationData } from '@/utils/redis-helper.js';
import { logger } from '@/utils/logger.js';
import { AppError } from '@/middleware/errorHandler.js';
import { eq, and } from 'drizzle-orm';
import { emitParticipantLocationUpdated } from '@/socket/emitter.js';

/**
 * 참가자 추가 요청
 */
export interface AddParticipantRequest {
  sessionId: string;
  name: string;
  location: {
    lat: string;
    lng: string;
    displayName?: string;
  };
}

/**
 * 위치 업데이트 요청
 */
export interface UpdateLocationRequest {
  lat: string;
  lng: string;
  displayName?: string;
}

/**
 * 참가자 응답
 */
export interface ParticipantResponse {
  id: string;
  sessionId: string;
  name: string;
  location: {
    lat: string;
    lng: string;
    displayName?: string;
  };
  joinedAt: string;
  lastActiveAt: string;
}

/**
 * 참가자 관리 서비스
 */
export class ParticipantService {
  /**
   * 참가자 추가
   */
  async addParticipant(request: AddParticipantRequest): Promise<ParticipantResponse> {
    const participantId = crypto.randomUUID();
    const now = new Date();

    try {
      // Redis에 참가자 정보 저장
      const redisParticipant: RedisParticipantData = {
        id: participantId,
        sessionId: request.sessionId,
        name: request.name,
        joinedAt: now.toISOString(),
        lastActiveAt: now.toISOString(),
      };

      await redisSessionManager.addParticipant(request.sessionId, participantId, redisParticipant);

      // Redis에 위치 정보 저장
      const redisLocation: RedisLocationData = {
        lat: request.location.lat,
        lng: request.location.lng,
        displayName: request.location.displayName,
        updatedAt: now.toISOString(),
      };

      await redisSessionManager.updateLocation(request.sessionId, participantId, redisLocation);

      // PostgreSQL에 영구 저장 (DB 사용 가능한 경우만)
      if (db) {
        const dbData: NewParticipant = {
          id: participantId,
          sessionId: request.sessionId,
          name: request.name,
          locationLat: request.location.lat,
          locationLng: request.location.lng,
          locationDisplayName: request.location.displayName,
        };

        await db.insert(participants).values(dbData);
        logger.info('Participant saved to database', { participantId, sessionId: request.sessionId });
      } else {
        logger.warn('Database not available - participant only in Redis', { participantId });
      }

      logger.info('Participant added', {
        participantId,
        sessionId: request.sessionId,
        name: request.name,
      });

      return {
        id: participantId,
        sessionId: request.sessionId,
        name: request.name,
        location: {
          lat: request.location.lat,
          lng: request.location.lng,
          displayName: request.location.displayName,
        },
        joinedAt: now.toISOString(),
        lastActiveAt: now.toISOString(),
      };
    } catch (error) {
      logger.error('Failed to add participant', {
        error: (error as Error).message,
        request,
      });

      throw new AppError(
        '참가자 추가에 실패했습니다',
        500,
        'PARTICIPANT_ADD_ERROR',
        true,
        { request }
      );
    }
  }

  /**
   * 참가자 목록 조회 (Redis 우선)
   */
  async getParticipants(sessionId: string): Promise<ParticipantResponse[]> {
    try {
      // 1. Redis에서 참가자 정보 조회
      const redisParticipants = await redisSessionManager.getParticipants(sessionId);
      const participantIds = Object.keys(redisParticipants);

      if (participantIds.length > 0) {
        // Redis에서 위치 정보도 조회
        const locations = await redisSessionManager.getAllLocations(sessionId, participantIds);

        const results: ParticipantResponse[] = participantIds.map((id) => {
          const participant = redisParticipants[id];
          const location = locations[id];

          return {
            id: participant.id,
            sessionId: participant.sessionId,
            name: participant.name,
            location: location
              ? {
                  lat: location.lat,
                  lng: location.lng,
                  displayName: location.displayName,
                }
              : { lat: '0', lng: '0' }, // fallback
            joinedAt: participant.joinedAt,
            lastActiveAt: participant.lastActiveAt,
          };
        });

        logger.debug('Participants found in Redis', { sessionId, count: results.length });
        return results;
      }

      // 2. Redis에 없으면 DB에서 조회 (fallback)
      if (db) {
        const dbData = await db.query.participants.findMany({
          where: eq(participants.sessionId, sessionId),
        });

        const results: ParticipantResponse[] = dbData.map((p) => ({
          id: p.id,
          sessionId: p.sessionId,
          name: p.name,
          location: {
            lat: p.locationLat,
            lng: p.locationLng,
            displayName: p.locationDisplayName || undefined,
          },
          joinedAt: p.joinedAt.toISOString(),
          lastActiveAt: p.lastActiveAt.toISOString(),
        }));

        // Redis에 다시 캐시
        for (const result of results) {
          const redisParticipant: RedisParticipantData = {
            id: result.id,
            sessionId: result.sessionId,
            name: result.name,
            joinedAt: result.joinedAt,
            lastActiveAt: result.lastActiveAt,
          };

          await redisSessionManager.addParticipant(sessionId, result.id, redisParticipant);

          const redisLocation: RedisLocationData = {
            lat: result.location.lat,
            lng: result.location.lng,
            displayName: result.location.displayName,
            updatedAt: result.lastActiveAt,
          };

          await redisSessionManager.updateLocation(sessionId, result.id, redisLocation);
        }

        logger.debug('Participants found in database', { sessionId, count: results.length });
        return results;
      }

      // 3. 어디에도 없음
      return [];
    } catch (error) {
      logger.error('Failed to get participants', {
        sessionId,
        error: (error as Error).message,
      });

      throw new AppError(
        '참가자 조회에 실패했습니다',
        500,
        'PARTICIPANT_GET_ERROR',
        true,
        { sessionId }
      );
    }
  }

  /**
   * 특정 참가자 조회
   */
  async getParticipant(sessionId: string, participantId: string): Promise<ParticipantResponse | null> {
    try {
      const allParticipants = await this.getParticipants(sessionId);
      const participant = allParticipants.find((p) => p.id === participantId);

      return participant || null;
    } catch (error) {
      logger.error('Failed to get participant', {
        sessionId,
        participantId,
        error: (error as Error).message,
      });

      throw new AppError(
        '참가자 조회에 실패했습니다',
        500,
        'PARTICIPANT_GET_ERROR',
        true,
        { sessionId, participantId }
      );
    }
  }

  /**
   * 위치 업데이트 (실시간)
   */
  async updateLocation(
    sessionId: string,
    participantId: string,
    location: UpdateLocationRequest
  ): Promise<void> {
    try {
      const now = new Date();

      // Redis 위치 업데이트
      const redisLocation: RedisLocationData = {
        lat: location.lat,
        lng: location.lng,
        displayName: location.displayName,
        updatedAt: now.toISOString(),
      };

      await redisSessionManager.updateLocation(sessionId, participantId, redisLocation);

      // DB 업데이트 (비동기로, 실패해도 괜찮음)
      if (db) {
        db.update(participants)
          .set({
            locationLat: location.lat,
            locationLng: location.lng,
            locationDisplayName: location.displayName,
            lastActiveAt: now,
          })
          .where(and(
            eq(participants.sessionId, sessionId),
            eq(participants.id, participantId)
          ))
          .catch((error) => {
            logger.error('Failed to update location in database', {
              sessionId,
              participantId,
              error: (error as Error).message,
            });
          });
      }

      logger.debug('Location updated', { sessionId, participantId });

      // Socket.io 위치 업데이트 실시간 이벤트
      try {
        emitParticipantLocationUpdated(sessionId, participantId, {
          lat: location.lat,
          lng: location.lng,
          displayName: location.displayName,
        });
      } catch (socketError) {
        // Socket 이벤트 실패는 로깅만 하고 에러로 처리하지 않음
        logger.warn('Failed to emit location update socket event', {
          error: (socketError as Error).message,
          sessionId,
          participantId,
        });
      }
    } catch (error) {
      logger.error('Failed to update location', {
        sessionId,
        participantId,
        error: (error as Error).message,
      });

      throw new AppError(
        '위치 업데이트에 실패했습니다',
        500,
        'LOCATION_UPDATE_ERROR',
        true,
        { sessionId, participantId }
      );
    }
  }

  /**
   * 참가자 활동 시간 업데이트 (heartbeat)
   */
  async updateLastActive(sessionId: string, participantId: string): Promise<void> {
    try {
      const now = new Date();

      // Redis 참가자 정보 조회 후 업데이트
      const participants = await redisSessionManager.getParticipants(sessionId);
      const participant = participants[participantId];

      if (participant) {
        participant.lastActiveAt = now.toISOString();
        await redisSessionManager.addParticipant(sessionId, participantId, participant);
      }

      // DB 업데이트 (비동기)
      if (db) {
        db.update(participants)
          .set({ lastActiveAt: now })
          .where(and(
            eq(participants.sessionId, sessionId),
            eq(participants.id, participantId)
          ))
          .catch((error) => {
            logger.error('Failed to update last active in database', {
              sessionId,
              participantId,
              error: (error as Error).message,
            });
          });
      }

      logger.debug('Last active updated', { sessionId, participantId });
    } catch (error) {
      logger.error('Failed to update last active', {
        sessionId,
        participantId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * 참가자 제거
   */
  async removeParticipant(sessionId: string, participantId: string): Promise<void> {
    try {
      // Redis에서 제거는 세션 삭제 시 처리됨
      // DB에서 제거
      if (db) {
        await db.delete(participants).where(and(
          eq(participants.sessionId, sessionId),
          eq(participants.id, participantId)
        ));

        logger.info('Participant removed from database', { sessionId, participantId });
      }

      logger.info('Participant removed', { sessionId, participantId });
    } catch (error) {
      logger.error('Failed to remove participant', {
        sessionId,
        participantId,
        error: (error as Error).message,
      });

      throw new AppError(
        '참가자 제거에 실패했습니다',
        500,
        'PARTICIPANT_REMOVE_ERROR',
        true,
        { sessionId, participantId }
      );
    }
  }
}

// 싱글톤 인스턴스
export const participantService = new ParticipantService();
