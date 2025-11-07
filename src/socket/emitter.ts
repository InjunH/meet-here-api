/**
 * @fileoverview Socket.io 이벤트 발생 헬퍼
 * REST API에서 Socket 이벤트를 발생시키기 위한 유틸리티
 */

import type { Namespace } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketData,
  VoteCastedData,
  VoteStatusData,
  ParticipantLocationUpdatedData,
  SessionStatusChangedData,
} from '@/socket/types.js';
import { logger } from '@/utils/logger.js';

// Socket.io 네임스페이스 저장소
let meetingNamespace: Namespace<ClientToServerEvents, ServerToClientEvents, {}, SocketData> | null = null;

/**
 * Socket.io 네임스페이스 초기화
 */
export function initializeSocketEmitter(
  namespace: Namespace<ClientToServerEvents, ServerToClientEvents, {}, SocketData>
) {
  meetingNamespace = namespace;
  logger.info('Socket emitter initialized');
}

/**
 * Socket.io 네임스페이스 가져오기
 */
export function getSocketNamespace() {
  return meetingNamespace;
}

/**
 * 세션 room 이름 생성
 */
function getSessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

/**
 * 투표 완료 이벤트 발생
 */
export function emitVoteCasted(sessionId: string, participantId: string, placeId: string) {
  if (!meetingNamespace) {
    logger.warn('Socket namespace not initialized - skipping vote:casted event');
    return;
  }

  const data: VoteCastedData = {
    sessionId,
    participantId,
    placeId,
    timestamp: new Date().toISOString(),
  };

  const room = getSessionRoom(sessionId);
  meetingNamespace.to(room).emit('vote:casted', data);

  logger.debug('Emitted vote:casted event', { sessionId, participantId, placeId, room });
}

/**
 * 투표 현황 업데이트 이벤트 발생
 */
export function emitVoteStatus(
  sessionId: string,
  totalVotes: number,
  results: Array<{ placeId: string; voteCount: number; voters: string[] }>
) {
  if (!meetingNamespace) {
    logger.warn('Socket namespace not initialized - skipping vote:status event');
    return;
  }

  const data: VoteStatusData = {
    sessionId,
    totalVotes,
    results,
  };

  const room = getSessionRoom(sessionId);
  meetingNamespace.to(room).emit('vote:status', data);

  logger.debug('Emitted vote:status event', { sessionId, totalVotes, resultsCount: results.length });
}

/**
 * 참가자 위치 업데이트 이벤트 발생
 */
export function emitParticipantLocationUpdated(
  sessionId: string,
  participantId: string,
  location: { lat: string; lng: string; displayName?: string }
) {
  if (!meetingNamespace) {
    logger.warn('Socket namespace not initialized - skipping participant:location:updated event');
    return;
  }

  const data: ParticipantLocationUpdatedData = {
    sessionId,
    participantId,
    location,
    timestamp: new Date().toISOString(),
  };

  const room = getSessionRoom(sessionId);
  meetingNamespace.to(room).emit('participant:location:updated', data);

  logger.debug('Emitted participant:location:updated event', { sessionId, participantId });
}

/**
 * 세션 상태 변경 이벤트 발생
 */
export function emitSessionStatusChanged(
  sessionId: string,
  status: 'active' | 'voting' | 'completed' | 'cancelled'
) {
  if (!meetingNamespace) {
    logger.warn('Socket namespace not initialized - skipping session:status:changed event');
    return;
  }

  const data: SessionStatusChangedData = {
    sessionId,
    status,
    timestamp: new Date().toISOString(),
  };

  const room = getSessionRoom(sessionId);
  meetingNamespace.to(room).emit('session:status:changed', data);

  logger.info('Emitted session:status:changed event', { sessionId, status });
}
