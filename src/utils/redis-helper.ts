/**
 * @fileoverview Redis 데이터 구조 및 헬퍼 함수
 * 실시간 세션 데이터 관리를 위한 Redis 유틸리티
 */

import { getRedisClient } from '@/utils/redis.js';
import { logger } from '@/utils/logger.js';

// Redis 키 프리픽스
const REDIS_PREFIX = {
  SESSION: 'session:',           // session:{sessionId}
  PARTICIPANTS: 'participants:', // participants:{sessionId}
  LOCATIONS: 'locations:',       // locations:{sessionId}:{participantId}
  VOTES: 'votes:',              // votes:{sessionId}
  VOTE_COUNT: 'vote_count:',    // vote_count:{sessionId}:{placeId}
};

// TTL (Time To Live) - 24시간
const SESSION_TTL = 60 * 60 * 24;

/**
 * Redis 키 생성 헬퍼
 */
export const RedisKeys = {
  session: (sessionId: string) => `${REDIS_PREFIX.SESSION}${sessionId}`,
  participants: (sessionId: string) => `${REDIS_PREFIX.PARTICIPANTS}${sessionId}`,
  location: (sessionId: string, participantId: string) =>
    `${REDIS_PREFIX.LOCATIONS}${sessionId}:${participantId}`,
  votes: (sessionId: string) => `${REDIS_PREFIX.VOTES}${sessionId}`,
  voteCount: (sessionId: string, placeId: string) =>
    `${REDIS_PREFIX.VOTE_COUNT}${sessionId}:${placeId}`,
};

/**
 * 세션 데이터 타입
 */
export interface RedisSessionData {
  id: string;
  title: string;
  hostName: string;
  status: 'active' | 'voting' | 'completed' | 'cancelled';
  centerLat?: string;
  centerLng?: string;
  centerDisplayName?: string;
  selectedPlaceId?: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * 참가자 데이터 타입
 */
export interface RedisParticipantData {
  id: string;
  sessionId: string;
  name: string;
  joinedAt: string;
  lastActiveAt: string;
}

/**
 * 위치 데이터 타입
 */
export interface RedisLocationData {
  lat: string;
  lng: string;
  displayName?: string;
  updatedAt: string;
}

/**
 * 투표 데이터 타입
 */
export interface RedisVoteData {
  participantId: string;
  placeId: string;
  votedAt: string;
}

/**
 * Redis 세션 관리 클래스
 */
export class RedisSessionManager {
  /**
   * Redis 클라이언트 가져오기 (매번 최신 상태 확인)
   */
  private get redis() {
    return getRedisClient();
  }

  /**
   * Redis 사용 가능 여부 확인
   */
  private isAvailable(): boolean {
    return this.redis !== null;
  }

  /**
   * 세션 생성/업데이트
   */
  async setSession(sessionId: string, data: RedisSessionData): Promise<void> {
    if (!this.isAvailable()) {
      logger.warn('Redis not available - session data not cached');
      return;
    }

    try {
      const key = RedisKeys.session(sessionId);
      await this.redis!.setEx(key, SESSION_TTL, JSON.stringify(data));
      logger.debug('Session cached in Redis', { sessionId });
    } catch (error) {
      logger.error('Failed to cache session in Redis', {
        sessionId,
        error: (error as Error).message
      });
    }
  }

  /**
   * 세션 조회
   */
  async getSession(sessionId: string): Promise<RedisSessionData | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const key = RedisKeys.session(sessionId);
      const data = await this.redis!.get(key);

      if (!data) return null;

      return JSON.parse(data) as RedisSessionData;
    } catch (error) {
      logger.error('Failed to get session from Redis', {
        sessionId,
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * 참가자 추가
   */
  async addParticipant(sessionId: string, participantId: string, data: RedisParticipantData): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const key = RedisKeys.participants(sessionId);
      await this.redis!.hSet(key, participantId, JSON.stringify(data));
      await this.redis!.expire(key, SESSION_TTL);
      logger.debug('Participant added to Redis', { sessionId, participantId });
    } catch (error) {
      logger.error('Failed to add participant to Redis', {
        sessionId,
        participantId,
        error: (error as Error).message
      });
    }
  }

  /**
   * 모든 참가자 조회
   */
  async getParticipants(sessionId: string): Promise<Record<string, RedisParticipantData>> {
    if (!this.isAvailable()) return {};

    try {
      const key = RedisKeys.participants(sessionId);
      const data = await this.redis!.hGetAll(key);

      const participants: Record<string, RedisParticipantData> = {};
      for (const [id, json] of Object.entries(data)) {
        participants[id] = JSON.parse(json);
      }

      return participants;
    } catch (error) {
      logger.error('Failed to get participants from Redis', {
        sessionId,
        error: (error as Error).message
      });
      return {};
    }
  }

  /**
   * 참가자 위치 업데이트
   */
  async updateLocation(
    sessionId: string,
    participantId: string,
    location: RedisLocationData
  ): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const key = RedisKeys.location(sessionId, participantId);
      await this.redis!.setEx(key, SESSION_TTL, JSON.stringify(location));
      logger.debug('Location updated in Redis', { sessionId, participantId });
    } catch (error) {
      logger.error('Failed to update location in Redis', {
        sessionId,
        participantId,
        error: (error as Error).message
      });
    }
  }

  /**
   * 모든 참가자 위치 조회
   */
  async getAllLocations(sessionId: string, participantIds: string[]): Promise<Record<string, RedisLocationData>> {
    if (!this.isAvailable()) return {};

    try {
      const locations: Record<string, RedisLocationData> = {};

      for (const participantId of participantIds) {
        const key = RedisKeys.location(sessionId, participantId);
        const data = await this.redis!.get(key);

        if (data) {
          locations[participantId] = JSON.parse(data);
        }
      }

      return locations;
    } catch (error) {
      logger.error('Failed to get locations from Redis', {
        sessionId,
        error: (error as Error).message
      });
      return {};
    }
  }

  /**
   * 투표 추가
   */
  async addVote(sessionId: string, participantId: string, vote: RedisVoteData): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      // 투표 저장
      const votesKey = RedisKeys.votes(sessionId);
      await this.redis!.hSet(votesKey, participantId, JSON.stringify(vote));
      await this.redis!.expire(votesKey, SESSION_TTL);

      // 투표 카운트 증가
      const countKey = RedisKeys.voteCount(sessionId, vote.placeId);
      await this.redis!.incr(countKey);
      await this.redis!.expire(countKey, SESSION_TTL);

      logger.debug('Vote added to Redis', { sessionId, participantId, placeId: vote.placeId });
    } catch (error) {
      logger.error('Failed to add vote to Redis', {
        sessionId,
        participantId,
        error: (error as Error).message,
        stack: (error as Error).stack
      });
    }
  }

  /**
   * 투표 취소 (재투표를 위해)
   */
  async removeVote(sessionId: string, participantId: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      // 기존 투표 조회
      const votesKey = RedisKeys.votes(sessionId);
      const existingVote = await this.redis!.hGet(votesKey, participantId);

      if (existingVote) {
        const vote = JSON.parse(existingVote) as RedisVoteData;

        // 투표 카운트 감소
        const countKey = RedisKeys.voteCount(sessionId, vote.placeId);
        await this.redis!.decr(countKey);
      }

      // 투표 삭제
      await this.redis!.hDel(votesKey, participantId);

      logger.debug('Vote removed from Redis', { sessionId, participantId });
    } catch (error) {
      logger.error('Failed to remove vote from Redis', {
        sessionId,
        participantId,
        error: (error as Error).message,
        stack: (error as Error).stack
      });
    }
  }

  /**
   * 모든 투표 조회
   */
  async getVotes(sessionId: string): Promise<Record<string, RedisVoteData>> {
    if (!this.isAvailable()) return {};

    try {
      const key = RedisKeys.votes(sessionId);
      const data = await this.redis!.hGetAll(key);

      const votes: Record<string, RedisVoteData> = {};
      for (const [participantId, json] of Object.entries(data)) {
        votes[participantId] = JSON.parse(json);
      }

      return votes;
    } catch (error) {
      logger.error('Failed to get votes from Redis', {
        sessionId,
        error: (error as Error).message,
        stack: (error as Error).stack
      });
      return {};
    }
  }

  /**
   * 투표 집계 결과 조회
   */
  async getVoteCounts(sessionId: string, placeIds: string[]): Promise<Record<string, number>> {
    if (!this.isAvailable()) return {};

    try {
      const counts: Record<string, number> = {};

      for (const placeId of placeIds) {
        const key = RedisKeys.voteCount(sessionId, placeId);
        const count = await this.redis!.get(key);
        counts[placeId] = count ? parseInt(count, 10) : 0;
      }

      return counts;
    } catch (error) {
      logger.error('Failed to get vote counts from Redis', {
        sessionId,
        error: (error as Error).message
      });
      return {};
    }
  }

  /**
   * 세션 삭제 (모든 관련 데이터 정리)
   */
  async deleteSession(sessionId: string, participantIds: string[]): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const keys = [
        RedisKeys.session(sessionId),
        RedisKeys.participants(sessionId),
        RedisKeys.votes(sessionId),
        ...participantIds.map(id => RedisKeys.location(sessionId, id))
      ];

      await this.redis!.del(...keys);
      logger.info('Session deleted from Redis', { sessionId });
    } catch (error) {
      logger.error('Failed to delete session from Redis', {
        sessionId,
        error: (error as Error).message
      });
    }
  }
}

// 싱글톤 인스턴스
export const redisSessionManager = new RedisSessionManager();
