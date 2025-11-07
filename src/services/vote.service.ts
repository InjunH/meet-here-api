/**
 * @fileoverview 투표 관리 서비스
 * 실시간 투표: Redis (즉시 반영) + PostgreSQL (영구 저장)
 */

import { db } from '@/db/connection.js';
import { votes, recommendedPlaces, type NewVote } from '@/db/schema.js';
import { redisSessionManager, type RedisVoteData } from '@/utils/redis-helper.js';
import { logger } from '@/utils/logger.js';
import { AppError } from '@/middleware/errorHandler.js';
import { eq, and } from 'drizzle-orm';
import { emitVoteCasted, emitVoteStatus } from '@/socket/emitter.js';

/**
 * 투표 요청
 */
export interface CastVoteRequest {
  sessionId: string;
  participantId: string;
  placeId: string;
}

/**
 * 투표 결과
 */
export interface VoteResult {
  placeId: string;
  placeName?: string;
  voteCount: number;
  voters: string[]; // participantId 목록
}

/**
 * 투표 현황 응답
 */
export interface VoteStatusResponse {
  sessionId: string;
  totalVotes: number;
  results: VoteResult[];
  hasVoted: Record<string, boolean>; // participantId -> voted
}

/**
 * 투표 관리 서비스
 */
export class VoteService {
  /**
   * 투표하기
   */
  async castVote(request: CastVoteRequest): Promise<void> {
    try {
      const now = new Date();

      // 기존 투표 확인 및 취소 (재투표)
      const existingVotes = await redisSessionManager.getVotes(request.sessionId);
      if (existingVotes[request.participantId]) {
        await this.cancelVote(request.sessionId, request.participantId);
      }

      // Redis에 투표 저장 (실시간 집계)
      const voteData: RedisVoteData = {
        participantId: request.participantId,
        placeId: request.placeId,
        votedAt: now.toISOString(),
      };

      await redisSessionManager.addVote(request.sessionId, request.participantId, voteData);

      // PostgreSQL에 영구 저장
      if (db) {
        // 기존 투표 삭제 (재투표 케이스)
        await db.delete(votes).where(and(
          eq(votes.sessionId, request.sessionId),
          eq(votes.participantId, request.participantId)
        ));

        // 새 투표 저장
        const dbData: NewVote = {
          sessionId: request.sessionId,
          participantId: request.participantId,
          placeId: request.placeId,
        };

        await db.insert(votes).values(dbData);
        logger.info('Vote saved to database', {
          sessionId: request.sessionId,
          participantId: request.participantId,
          placeId: request.placeId,
        });
      }

      logger.info('Vote cast', {
        sessionId: request.sessionId,
        participantId: request.participantId,
        placeId: request.placeId,
      });

      // Socket.io 실시간 이벤트 발생
      try {
        // 투표 완료 이벤트
        emitVoteCasted(request.sessionId, request.participantId, request.placeId);

        // 투표 현황 업데이트 이벤트
        const allVotes = await redisSessionManager.getVotes(request.sessionId);
        const placeIds = [...new Set(Object.values(allVotes).map(v => v.placeId))];
        const voteCounts = await redisSessionManager.getVoteCounts(request.sessionId, placeIds);

        const results = placeIds.map(placeId => ({
          placeId,
          voteCount: voteCounts[placeId] || 0,
          voters: Object.entries(allVotes)
            .filter(([_, vote]) => vote.placeId === placeId)
            .map(([participantId]) => participantId),
        }));

        emitVoteStatus(request.sessionId, Object.keys(allVotes).length, results);
      } catch (socketError) {
        // Socket 이벤트 실패는 로깅만 하고 에러로 처리하지 않음
        logger.warn('Failed to emit vote socket events', {
          error: (socketError as Error).message,
          sessionId: request.sessionId,
        });
      }
    } catch (error) {
      logger.error('Failed to cast vote', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        request,
      });

      throw new AppError(
        '투표 처리에 실패했습니다',
        500,
        'VOTE_CAST_ERROR',
        true,
        { request, originalError: (error as Error).message }
      );
    }
  }

  /**
   * 투표 취소
   */
  async cancelVote(sessionId: string, participantId: string): Promise<void> {
    try {
      // Redis에서 투표 제거
      await redisSessionManager.removeVote(sessionId, participantId);

      // DB에서 투표 제거
      if (db) {
        await db.delete(votes).where(and(
          eq(votes.sessionId, sessionId),
          eq(votes.participantId, participantId)
        ));

        logger.info('Vote removed from database', { sessionId, participantId });
      }

      logger.info('Vote cancelled', { sessionId, participantId });

      // Socket.io 투표 현황 업데이트 이벤트
      try {
        const allVotes = await redisSessionManager.getVotes(sessionId);
        const placeIds = [...new Set(Object.values(allVotes).map(v => v.placeId))];
        const voteCounts = await redisSessionManager.getVoteCounts(sessionId, placeIds);

        const results = placeIds.map(placeId => ({
          placeId,
          voteCount: voteCounts[placeId] || 0,
          voters: Object.entries(allVotes)
            .filter(([_, vote]) => vote.placeId === placeId)
            .map(([participantId]) => participantId),
        }));

        emitVoteStatus(sessionId, Object.keys(allVotes).length, results);
      } catch (socketError) {
        logger.warn('Failed to emit vote status socket event', {
          error: (socketError as Error).message,
          sessionId,
        });
      }
    } catch (error) {
      logger.error('Failed to cancel vote', {
        sessionId,
        participantId,
        error: (error as Error).message,
      });

      throw new AppError(
        '투표 취소에 실패했습니다',
        500,
        'VOTE_CANCEL_ERROR',
        true,
        { sessionId, participantId }
      );
    }
  }

  /**
   * 투표 현황 조회 (실시간)
   */
  async getVoteStatus(sessionId: string, placeIds: string[]): Promise<VoteStatusResponse> {
    try {
      // Redis에서 투표 데이터 조회
      const votes = await redisSessionManager.getVotes(sessionId);
      const voteCounts = await redisSessionManager.getVoteCounts(sessionId, placeIds);

      // 투표 결과 집계
      const results: VoteResult[] = placeIds.map((placeId) => {
        const voters = Object.entries(votes)
          .filter(([_, vote]) => vote.placeId === placeId)
          .map(([participantId]) => participantId);

        return {
          placeId,
          voteCount: voteCounts[placeId] || 0,
          voters,
        };
      });

      // 참가자별 투표 여부
      const hasVoted: Record<string, boolean> = {};
      for (const [participantId, vote] of Object.entries(votes)) {
        hasVoted[participantId] = true;
      }

      const totalVotes = Object.keys(votes).length;

      logger.debug('Vote status retrieved', {
        sessionId,
        totalVotes,
        resultsCount: results.length,
      });

      return {
        sessionId,
        totalVotes,
        results,
        hasVoted,
      };
    } catch (error) {
      logger.error('Failed to get vote status', {
        sessionId,
        error: (error as Error).message,
      });

      throw new AppError(
        '투표 현황 조회에 실패했습니다',
        500,
        'VOTE_STATUS_ERROR',
        true,
        { sessionId }
      );
    }
  }

  /**
   * 최다 득표 장소 조회
   */
  async getWinningPlace(sessionId: string, placeIds: string[]): Promise<string | null> {
    try {
      const voteCounts = await redisSessionManager.getVoteCounts(sessionId, placeIds);

      let maxVotes = 0;
      let winningPlaceId: string | null = null;

      for (const [placeId, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) {
          maxVotes = count;
          winningPlaceId = placeId;
        }
      }

      logger.debug('Winning place determined', {
        sessionId,
        winningPlaceId,
        maxVotes,
      });

      return winningPlaceId;
    } catch (error) {
      logger.error('Failed to get winning place', {
        sessionId,
        error: (error as Error).message,
      });

      throw new AppError(
        '최다 득표 장소 조회에 실패했습니다',
        500,
        'WINNING_PLACE_ERROR',
        true,
        { sessionId }
      );
    }
  }

  /**
   * 특정 참가자의 투표 조회
   */
  async getParticipantVote(sessionId: string, participantId: string): Promise<string | null> {
    try {
      const votes = await redisSessionManager.getVotes(sessionId);
      const vote = votes[participantId];

      return vote ? vote.placeId : null;
    } catch (error) {
      logger.error('Failed to get participant vote', {
        sessionId,
        participantId,
        error: (error as Error).message,
      });

      throw new AppError(
        '참가자 투표 조회에 실패했습니다',
        500,
        'PARTICIPANT_VOTE_ERROR',
        true,
        { sessionId, participantId }
      );
    }
  }

  /**
   * DB에서 투표 데이터 로드 (Redis 재구성용)
   */
  async loadVotesFromDB(sessionId: string): Promise<void> {
    if (!db) {
      logger.warn('Database not available - cannot load votes');
      return;
    }

    try {
      const dbVotes = await db.query.votes.findMany({
        where: eq(votes.sessionId, sessionId),
      });

      for (const vote of dbVotes) {
        const voteData: RedisVoteData = {
          participantId: vote.participantId,
          placeId: vote.placeId,
          votedAt: vote.votedAt.toISOString(),
        };

        await redisSessionManager.addVote(sessionId, vote.participantId, voteData);
      }

      logger.info('Votes loaded from database to Redis', {
        sessionId,
        count: dbVotes.length,
      });
    } catch (error) {
      logger.error('Failed to load votes from database', {
        sessionId,
        error: (error as Error).message,
      });

      throw new AppError(
        'DB 투표 데이터 로드에 실패했습니다',
        500,
        'LOAD_VOTES_ERROR',
        true,
        { sessionId }
      );
    }
  }

  /**
   * 투표 통계 (분석용)
   */
  async getVoteStatistics(sessionId: string): Promise<{
    totalVotes: number;
    uniqueVoters: number;
    votingRate: number;
    topPlace: { placeId: string; voteCount: number } | null;
  }> {
    try {
      const votes = await redisSessionManager.getVotes(sessionId);
      const uniqueVoters = Object.keys(votes).length;

      // 장소별 투표 수 집계
      const placeCounts: Record<string, number> = {};
      for (const vote of Object.values(votes)) {
        placeCounts[vote.placeId] = (placeCounts[vote.placeId] || 0) + 1;
      }

      // 최다 득표 장소
      let topPlace: { placeId: string; voteCount: number } | null = null;
      let maxVotes = 0;

      for (const [placeId, count] of Object.entries(placeCounts)) {
        if (count > maxVotes) {
          maxVotes = count;
          topPlace = { placeId, voteCount: count };
        }
      }

      return {
        totalVotes: uniqueVoters,
        uniqueVoters,
        votingRate: 0, // 참가자 수 정보 필요
        topPlace,
      };
    } catch (error) {
      logger.error('Failed to get vote statistics', {
        sessionId,
        error: (error as Error).message,
      });

      throw new AppError(
        '투표 통계 조회에 실패했습니다',
        500,
        'VOTE_STATS_ERROR',
        true,
        { sessionId }
      );
    }
  }
}

// 싱글톤 인스턴스
export const voteService = new VoteService();
