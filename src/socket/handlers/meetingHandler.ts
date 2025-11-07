import { Namespace, Socket } from 'socket.io';
import { z } from 'zod';
import { logger } from '@/utils/logger.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  JoinMeetingData,
  AddLocationData,
  MeetingStateData,
} from '@/socket/types.js';

// Zod 검증 스키마
const JoinMeetingSchema = z.object({
  meetingCode: z.string().regex(/^[A-Z0-9]{6}$/, 'Meeting code must be 6 alphanumeric characters'),
  userId: z.string().min(1, 'User ID is required'),
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
});

const AddLocationSchema = z.object({
  meetingCode: z.string().regex(/^[A-Z0-9]{6}$/),
  location: z.object({
    name: z.string().min(1).max(100),
    address: z.string().min(1).max(200),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
});

// 임시 메모리 저장소 (프로토타입용)
const meetingStore: Map<string, MeetingStateData> = new Map();

/**
 * 미팅 이벤트 핸들러 설정
 */
export function setupMeetingHandlers(
  namespace: Namespace<ClientToServerEvents, ServerToClientEvents, {}, SocketData>
) {
  logger.info('Setting up meeting event handlers...');

  namespace.on('connection', (socket) => {
    logger.info('New connection to /meetings namespace', {
      socketId: socket.id,
    });

    // ===== 미팅 참가 =====
    socket.on('meeting:join', async (data) => {
      try {
        // 데이터 검증
        const validated = JoinMeetingSchema.parse(data);
        const { meetingCode, userId, name } = validated;
        const roomName = `room:${meetingCode}`;

        logger.info('User joining meeting', {
          socketId: socket.id,
          meetingCode,
          userId,
          name,
        });

        // Socket 데이터 저장
        socket.data.userId = userId;
        socket.data.meetingCode = meetingCode;
        socket.data.userName = name;

        // Room 참가
        await socket.join(roomName);

        // 미팅 상태 초기화 (없으면)
        if (!meetingStore.has(meetingCode)) {
          meetingStore.set(meetingCode, {
            meetingCode,
            participants: [],
            locations: [],
          });
        }

        // 참가자 추가
        const meetingState = meetingStore.get(meetingCode)!;
        if (!meetingState.participants.find((p) => p.userId === userId)) {
          meetingState.participants.push({ userId, name });
        }

        // 기존 참가자들에게 알림 (자신 제외)
        socket.to(roomName).emit('meeting:joined', {
          userId,
          name,
          timestamp: new Date().toISOString(),
        });

        // 현재 사용자에게 미팅 상태 전송
        socket.emit('meeting:state', meetingState);

        logger.info('User joined meeting successfully', {
          meetingCode,
          userId,
          participantCount: meetingState.participants.length,
        });
      } catch (error) {
        logger.error('Failed to join meeting', {
          error: error instanceof Error ? error.message : 'Unknown error',
          socketId: socket.id,
          data,
        });

        socket.emit('error', {
          code: 'JOIN_FAILED',
          message: error instanceof z.ZodError ? error.errors[0].message : 'Failed to join meeting',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // ===== 위치 추가 =====
    socket.on('location:add', async (data) => {
      try {
        // 데이터 검증
        const validated = AddLocationSchema.parse(data);
        const { meetingCode, location } = validated;
        const roomName = `room:${meetingCode}`;
        const userId = socket.data.userId || 'unknown';

        logger.info('Adding location', {
          socketId: socket.id,
          meetingCode,
          location: location.name,
          userId,
        });

        // 미팅 상태 확인
        const meetingState = meetingStore.get(meetingCode);
        if (!meetingState) {
          throw new Error('Meeting not found');
        }

        // 위치 ID 생성
        const locationId = `loc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        // 위치 추가
        const newLocation = {
          id: locationId,
          ...location,
          userId,
        };
        meetingState.locations.push(newLocation);

        // 중간지점 재계산
        const centerPoint = calculateCenterPoint(meetingState.locations);
        meetingState.centerPoint = centerPoint;

        // 모든 참가자에게 브로드캐스트
        namespace.to(roomName).emit('location:added', {
          location: newLocation,
          centerPoint,
        });

        logger.info('Location added successfully', {
          meetingCode,
          locationId,
          locationCount: meetingState.locations.length,
          centerPoint,
        });
      } catch (error) {
        logger.error('Failed to add location', {
          error: error instanceof Error ? error.message : 'Unknown error',
          socketId: socket.id,
          data,
        });

        socket.emit('error', {
          code: 'ADD_LOCATION_FAILED',
          message:
            error instanceof z.ZodError ? error.errors[0].message : 'Failed to add location',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // ===== 미팅 퇴장 =====
    socket.on('meeting:leave', async (data) => {
      try {
        const { meetingCode, userId } = data;
        const roomName = `room:${meetingCode}`;

        logger.info('User leaving meeting', {
          socketId: socket.id,
          meetingCode,
          userId,
        });

        // 참가자 제거
        const meetingState = meetingStore.get(meetingCode);
        if (meetingState) {
          const participant = meetingState.participants.find((p) => p.userId === userId);
          meetingState.participants = meetingState.participants.filter(
            (p) => p.userId !== userId
          );

          // 다른 참가자들에게 알림
          socket.to(roomName).emit('meeting:left', {
            userId,
            name: participant?.name || 'Unknown',
            timestamp: new Date().toISOString(),
          });
        }

        // Room 퇴장
        await socket.leave(roomName);

        logger.info('User left meeting successfully', {
          meetingCode,
          userId,
        });
      } catch (error) {
        logger.error('Failed to leave meeting', {
          error: error instanceof Error ? error.message : 'Unknown error',
          socketId: socket.id,
          data,
        });
      }
    });

    // ===== 연결 해제 =====
    socket.on('disconnect', (reason) => {
      const { userId, meetingCode, userName } = socket.data;

      if (meetingCode && userId) {
        logger.info('Client disconnected, cleaning up', {
          socketId: socket.id,
          meetingCode,
          userId,
          reason,
        });

        // 참가자 제거
        const meetingState = meetingStore.get(meetingCode);
        if (meetingState) {
          meetingState.participants = meetingState.participants.filter(
            (p) => p.userId !== userId
          );

          // 다른 참가자들에게 알림
          namespace.to(`room:${meetingCode}`).emit('meeting:left', {
            userId,
            name: userName || 'Unknown',
            timestamp: new Date().toISOString(),
          });
        }
      }
    });
  });

  logger.info('Meeting event handlers setup complete');
}

/**
 * 중간지점 계산 (Simple Centroid)
 */
function calculateCenterPoint(locations: Array<{ lat: number; lng: number }>) {
  if (locations.length === 0) {
    return { lat: 0, lng: 0 };
  }

  const totalLat = locations.reduce((sum, loc) => sum + loc.lat, 0);
  const totalLng = locations.reduce((sum, loc) => sum + loc.lng, 0);

  return {
    lat: Number((totalLat / locations.length).toFixed(6)),
    lng: Number((totalLng / locations.length).toFixed(6)),
  };
}
