# 🎯 MeetHere 실시간 다중 사용자 약속 잡기 기능 구현 계획

## 📋 개요

채팅방처럼 여러 사용자가 동시에 참여하여 실시간으로 위치를 공유하고 투표하는 웹소켓 기반 시스템 구축

**작성일**: 2025-11-04
**추정 작업 시간**: 3-4주
**복잡도**: 중상 (Socket.io 사용으로 복잡도 완화)
**위험도**: 중 (실시간 동기화 이슈 대비 필요)

---

## 📊 현재 프로젝트 현황

### 기술 스택 확인

#### **Frontend (meet_here_client)**

```json
{
  "프레임워크": "React 18.3.1 + TypeScript + Vite",
  "라우팅": "Wouter 3.3.5",
  "상태관리": "@tanstack/react-query 5.60.5",
  "UI": "Shadcn/ui + Radix UI + Tailwind CSS",
  "애니메이션": "Framer Motion + GSAP"
}
```

#### **Backend (meet_here_api)**

```json
{
  "프레임워크": "Express 4.18.2 + TypeScript",
  "데이터베이스": "PostgreSQL (Drizzle ORM)",
  "캐싱": "Redis 4.6.10 (이미 설치됨 ✅)",
  "검증": "Zod 3.22.4",
  "보안": "Helmet, CORS, express-rate-limit",
  "문서화": "Swagger (swagger-ui-express)"
}
```

### 현재 API 구조

```
/api/v1/
├── /meetings       - 미팅 세션 관리 (생성, 조회)
├── /places         - 장소 검색 및 추천
├── /votings        - 투표 시스템
├── /kakao          - 카카오맵 API 연동
├── /naver          - 네이버 API 연동
└── /meeting-point  - 중간지점 계산
```

### 실시간 동기화가 필요한 데이터

1. **참가자 위치 입력** - 실시간 위치 추가/수정/삭제
2. **장소 추천 목록** - 중간지점 기반 장소 실시간 업데이트
3. **투표 현황** - 실시간 투표 결과 동기화
4. **세션 상태** - 진행 단계 변경 (DRAFT → ACTIVE → VOTING → COMPLETED)
5. **참가자 상태** - 접속/퇴장 알림

---

## 🏗️ 웹소켓 아키텍처 설계

### 기술 스택 선택: Socket.io ✅

#### **Socket.io 선택 이유**

| 항목            | Socket.io                     | Native WebSocket |
| --------------- | ----------------------------- | ---------------- |
| **재연결**      | 자동 재연결 내장              | 수동 구현 필요   |
| **Room 관리**   | 내장 Room API                 | 수동 구현 필요   |
| **타입 안전성** | TypeScript 완벽 지원          | 추가 래퍼 필요   |
| **Fallback**    | Long Polling 자동 지원        | 없음             |
| **프로토콜**    | WebSocket + HTTP Long Polling | WebSocket only   |
| **학습곡선**    | 낮음 (친숙한 API)             | 높음             |
| **Redis 연동**  | socket.io-redis 공식 지원     | 수동 구현        |

#### **필요 패키지**

**Backend:**

```bash
npm install socket.io @socket.io/redis-adapter
npm install -D @types/socket.io
```

**Frontend:**

```bash
npm install socket.io-client
npm install -D @types/socket.io-client
```

---

### 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Socket.io Client Hook (useWebSocket)               │   │
│  │  - 자동 연결/재연결 관리                             │   │
│  │  - 이벤트 리스너 등록                                │   │
│  │  - React Query와 통합                                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ▼ WebSocket (Socket.io)
┌─────────────────────────────────────────────────────────────┐
│                   Backend (Express + Socket.io)             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Socket.io Server                                    │   │
│  │  - Namespace: /meetings                              │   │
│  │  - Room 기반 세션 격리                                │   │
│  │  - JWT/Device ID 인증                                 │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Redis Adapter (확장성)                              │   │
│  │  - 다중 서버 간 이벤트 브로드캐스트                   │   │
│  │  - 세션 상태 공유                                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data Layer                                │
│  ┌──────────┐          ┌──────────┐         ┌──────────┐   │
│  │PostgreSQL│          │  Redis   │         │ Memory   │   │
│  │(영구저장)│          │ (캐시)   │         │ (임시)   │   │
│  └──────────┘          └──────────┘         └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

### Room/Namespace 설계

#### **Namespace 구조**

```typescript
/meetings          - 미팅 관련 모든 이벤트
  ├── room:{meetingCode}  - 개별 미팅 세션 (예: room:ABC123)
  └── private:{userId}    - 개인 알림 (선택적)
```

#### **Room 관리 전략**

```typescript
// 미팅 코드 기반 Room 생성
socket.join(`room:${meetingCode}`);

// 해당 Room의 모든 클라이언트에게 브로드캐스트
io.to(`room:${meetingCode}`).emit("location:updated", data);

// 자신을 제외하고 브로드캐스트
socket.to(`room:${meetingCode}`).emit("participant:joined", data);
```

---

### 이벤트 명세

#### **Client → Server 이벤트**

| 이벤트명          | 데이터                                  | 설명           |
| ----------------- | --------------------------------------- | -------------- |
| `meeting:join`    | `{ meetingCode, userId, name }`         | 미팅 세션 참가 |
| `location:add`    | `{ meetingCode, location }`             | 위치 추가      |
| `location:update` | `{ meetingCode, locationId, location }` | 위치 수정      |
| `location:delete` | `{ meetingCode, locationId }`           | 위치 삭제      |
| `vote:cast`       | `{ meetingCode, placeId, vote }`        | 투표 실행      |
| `meeting:leave`   | `{ meetingCode, userId }`               | 미팅 퇴장      |

#### **Server → Client 이벤트**

| 이벤트명           | 데이터                           | 설명               |
| ------------------ | -------------------------------- | ------------------ |
| `meeting:joined`   | `{ userId, name, timestamp }`    | 참가자 입장 알림   |
| `meeting:left`     | `{ userId, name, timestamp }`    | 참가자 퇴장 알림   |
| `location:added`   | `{ location, userId }`           | 위치 추가됨 알림   |
| `location:updated` | `{ locationId, location }`       | 위치 업데이트 알림 |
| `location:deleted` | `{ locationId }`                 | 위치 삭제 알림     |
| `center:updated`   | `{ centerPoint, locations }`     | 중간지점 재계산됨  |
| `vote:updated`     | `{ placeId, votes, totalVotes }` | 투표 현황 업데이트 |
| `meeting:status`   | `{ status }`                     | 세션 상태 변경     |
| `error`            | `{ code, message }`              | 에러 알림          |

---

## 🔧 구현 계획

### Phase 1: Backend 구현

#### **1.1 Socket.io 서버 설정**

**파일: `meet_here_api/src/socket/index.ts`**

```typescript
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { getRedisClient } from "@/utils/redis";
import { logger } from "@/utils/logger";

export function setupSocketServer(httpServer: any) {
  const io = new Server(httpServer, {
    cors: corsOptions, // 기존 CORS 설정 재사용
    path: "/socket.io",
    transports: ["websocket", "polling"],
  });

  // Redis Adapter (다중 서버 지원)
  const redisClient = getRedisClient();
  if (redisClient) {
    const pubClient = redisClient;
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    logger.info("Socket.io Redis adapter configured");
  }

  // Namespace 설정
  const meetingNamespace = io.of("/meetings");

  return { io, meetingNamespace };
}
```

#### **1.2 이벤트 핸들러**

**파일: `meet_here_api/src/socket/handlers/meetingHandler.ts`**

```typescript
import { Namespace, Socket } from "socket.io";
import { logger } from "@/utils/logger";
import { z } from "zod";

// 이벤트 스키마 정의
const JoinMeetingSchema = z.object({
  meetingCode: z.string().regex(/^[A-Z0-9]{6}$/),
  userId: z.string().uuid(),
  name: z.string().min(1).max(50),
});

export function setupMeetingHandlers(namespace: Namespace) {
  namespace.on("connection", (socket: Socket) => {
    logger.info("Client connected", { socketId: socket.id });

    // 미팅 참가
    socket.on("meeting:join", async (data) => {
      try {
        const { meetingCode, userId, name } = JoinMeetingSchema.parse(data);
        const roomName = `room:${meetingCode}`;

        // Room 참가
        await socket.join(roomName);

        // 기존 참가자들에게 알림
        socket.to(roomName).emit("meeting:joined", {
          userId,
          name,
          timestamp: new Date().toISOString(),
        });

        // 현재 미팅 상태 전송
        const meetingState = await getMeetingState(meetingCode);
        socket.emit("meeting:state", meetingState);

        logger.info("User joined meeting", { userId, meetingCode });
      } catch (error) {
        socket.emit("error", {
          code: "JOIN_FAILED",
          message: "Failed to join meeting",
        });
      }
    });

    // 위치 추가
    socket.on("location:add", async (data) => {
      try {
        const { meetingCode, location } = data;
        const roomName = `room:${meetingCode}`;

        // 데이터베이스에 저장
        const savedLocation = await saveLocation(meetingCode, location);

        // 모든 참가자에게 브로드캐스트
        io.to(roomName).emit("location:added", {
          location: savedLocation,
          userId: socket.data.userId,
        });

        // 중간지점 재계산 트리거
        recalculateCenter(meetingCode, roomName);
      } catch (error) {
        socket.emit("error", {
          code: "ADD_LOCATION_FAILED",
          message: "Failed to add location",
        });
      }
    });

    // 투표 실행
    socket.on("vote:cast", async (data) => {
      try {
        const { meetingCode, placeId, vote } = data;
        const roomName = `room:${meetingCode}`;

        // 투표 저장
        await saveVote(meetingCode, placeId, socket.data.userId, vote);

        // 투표 현황 집계
        const voteStats = await getVoteStats(meetingCode, placeId);

        // 모든 참가자에게 업데이트
        io.to(roomName).emit("vote:updated", {
          placeId,
          votes: voteStats.votes,
          totalVotes: voteStats.total,
        });
      } catch (error) {
        socket.emit("error", {
          code: "VOTE_FAILED",
          message: "Failed to cast vote",
        });
      }
    });

    // 연결 종료
    socket.on("disconnect", () => {
      logger.info("Client disconnected", { socketId: socket.id });
    });
  });
}
```

#### **1.3 타입 정의**

**파일: `meet_here_api/src/socket/types.ts`**

```typescript
// Client → Server 이벤트
export interface ClientToServerEvents {
  "meeting:join": (data: JoinMeetingData) => void;
  "meeting:leave": (data: LeaveMeetingData) => void;
  "location:add": (data: AddLocationData) => void;
  "location:update": (data: UpdateLocationData) => void;
  "location:delete": (data: DeleteLocationData) => void;
  "vote:cast": (data: CastVoteData) => void;
}

// Server → Client 이벤트
export interface ServerToClientEvents {
  "meeting:joined": (data: ParticipantJoinedData) => void;
  "meeting:left": (data: ParticipantLeftData) => void;
  "meeting:state": (data: MeetingStateData) => void;
  "location:added": (data: LocationAddedData) => void;
  "location:updated": (data: LocationUpdatedData) => void;
  "location:deleted": (data: LocationDeletedData) => void;
  "center:updated": (data: CenterUpdatedData) => void;
  "vote:updated": (data: VoteUpdatedData) => void;
  error: (data: ErrorData) => void;
}

// Socket 데이터
export interface SocketData {
  userId: string;
  meetingCode?: string;
}

// 이벤트 데이터 타입
export interface JoinMeetingData {
  meetingCode: string;
  userId: string;
  name: string;
}

// ... 나머지 타입들
```

#### **1.4 Express 통합**

**파일: `meet_here_api/src/app.ts` 수정**

```typescript
import { createServer } from "http";
import { setupSocketServer } from "./socket/index.js";
import { setupMeetingHandlers } from "./socket/handlers/meetingHandler.js";

// Express 앱 생성 후...
const httpServer = createServer(app);

// Socket.io 설정
const { io, meetingNamespace } = setupSocketServer(httpServer);
setupMeetingHandlers(meetingNamespace);

// HTTP 서버 시작
httpServer.listen(serverConfig.port, () => {
  logger.info(`Server running on port ${serverConfig.port}`);
  logger.info("Socket.io server initialized");
});
```

---

### Phase 2: Frontend 구현

#### **2.1 Socket Context**

**파일: `meet_here_client/client/src/contexts/SocketContext.tsx`**

```typescript
import { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketInstance = io("http://localhost:5000/meetings", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketInstance.on("connect", () => {
      setIsConnected(true);
      console.log("🟢 Socket connected:", socketInstance.id);
    });

    socketInstance.on("disconnect", () => {
      setIsConnected(false);
      console.log("🔴 Socket disconnected");
    });

    socketInstance.on("error", (error) => {
      console.error("❌ Socket error:", error);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
```

#### **2.2 Custom Hook**

**파일: `meet_here_client/client/src/hooks/useMeetingSocket.ts`**

```typescript
import { useEffect, useCallback } from "react";
import { useSocket } from "@/contexts/SocketContext";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function useMeetingSocket(meetingCode: string) {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ===== Emit Functions =====

  // 미팅 참가
  const joinMeeting = useCallback(
    (userId: string, name: string) => {
      if (!socket) return;
      console.log("🎯 Joining meeting:", { meetingCode, userId, name });
      socket.emit("meeting:join", { meetingCode, userId, name });
    },
    [socket, meetingCode]
  );

  // 위치 추가
  const addLocation = useCallback(
    (location: any) => {
      if (!socket) return;
      console.log("📍 Adding location:", location);
      socket.emit("location:add", { meetingCode, location });
    },
    [socket, meetingCode]
  );

  // 위치 삭제
  const deleteLocation = useCallback(
    (locationId: string) => {
      if (!socket) return;
      console.log("🗑️ Deleting location:", locationId);
      socket.emit("location:delete", { meetingCode, locationId });
    },
    [socket, meetingCode]
  );

  // 투표 실행
  const castVote = useCallback(
    (placeId: string, vote: number) => {
      if (!socket) return;
      console.log("🗳️ Casting vote:", { placeId, vote });
      socket.emit("vote:cast", { meetingCode, placeId, vote });
    },
    [socket, meetingCode]
  );

  // ===== Event Listeners =====

  useEffect(() => {
    if (!socket) return;

    // 참가자 입장 이벤트
    socket.on("meeting:joined", (data) => {
      console.log("👤 Participant joined:", data);
      toast({
        title: "새로운 참가자",
        description: `${data.name}님이 입장했습니다.`,
      });
      queryClient.invalidateQueries(["meeting", meetingCode]);
    });

    // 참가자 퇴장 이벤트
    socket.on("meeting:left", (data) => {
      console.log("👋 Participant left:", data);
      toast({
        title: "참가자 퇴장",
        description: `${data.name}님이 퇴장했습니다.`,
      });
      queryClient.invalidateQueries(["meeting", meetingCode]);
    });

    // 미팅 상태 수신
    socket.on("meeting:state", (data) => {
      console.log("📊 Meeting state received:", data);
      queryClient.setQueryData(["meeting", meetingCode], data);
    });

    // 위치 추가 이벤트
    socket.on("location:added", (data) => {
      console.log("📍 Location added:", data);
      queryClient.setQueryData(["meeting", meetingCode], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          locations: [...(old.locations || []), data.location],
        };
      });
      toast({
        title: "위치 추가됨",
        description: "새로운 위치가 추가되었습니다.",
      });
    });

    // 위치 삭제 이벤트
    socket.on("location:deleted", (data) => {
      console.log("🗑️ Location deleted:", data);
      queryClient.setQueryData(["meeting", meetingCode], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          locations: old.locations?.filter(
            (loc: any) => loc.id !== data.locationId
          ),
        };
      });
    });

    // 중간지점 업데이트
    socket.on("center:updated", (data) => {
      console.log("🎯 Center updated:", data);
      queryClient.setQueryData(["meeting", meetingCode], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          centerPoint: data.centerPoint,
          locations: data.locations,
        };
      });
      toast({
        title: "중간지점 업데이트",
        description: "중간지점이 재계산되었습니다.",
      });
    });

    // 투표 현황 업데이트
    socket.on("vote:updated", (data) => {
      console.log("🗳️ Vote updated:", data);
      queryClient.setQueryData(["votes", meetingCode, data.placeId], data);
    });

    // 에러 이벤트
    socket.on("error", (error) => {
      console.error("❌ Socket error:", error);
      toast({
        title: "오류 발생",
        description: error.message,
        variant: "destructive",
      });
    });

    return () => {
      socket.off("meeting:joined");
      socket.off("meeting:left");
      socket.off("meeting:state");
      socket.off("location:added");
      socket.off("location:deleted");
      socket.off("center:updated");
      socket.off("vote:updated");
      socket.off("error");
    };
  }, [socket, meetingCode, queryClient, toast]);

  return {
    isConnected,
    joinMeeting,
    addLocation,
    deleteLocation,
    castVote,
  };
}
```

#### **2.3 타입 정의**

**파일: `meet_here_client/client/src/types/socket.ts`**

```typescript
// Backend와 동일한 이벤트 타입 정의
export interface JoinMeetingData {
  meetingCode: string;
  userId: string;
  name: string;
}

export interface ParticipantJoinedData {
  userId: string;
  name: string;
  timestamp: string;
}

// ... 나머지 타입들
```

#### **2.4 App에 Provider 추가**

**파일: `meet_here_client/client/src/main.tsx`**

```typescript
import { SocketProvider } from "@/contexts/SocketContext";

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SocketProvider>
        <App />
      </SocketProvider>
    </QueryClientProvider>
  </StrictMode>
);
```

#### **2.5 컴포넌트 통합**

**파일: `meet_here_client/client/src/pages/home.tsx` 수정**

```typescript
import { useMeetingSocket } from "@/hooks/useMeetingSocket";
import { useSocket } from "@/contexts/SocketContext";

export default function Home() {
  const meetingCode = "ABC123"; // URL 파라미터에서 추출
  const userId = "user-123"; // Device ID 또는 세션 ID
  const { isConnected } = useSocket();
  const { joinMeeting, addLocation, deleteLocation } =
    useMeetingSocket(meetingCode);

  useEffect(() => {
    if (isConnected) {
      joinMeeting(userId, "철수");
    }
  }, [isConnected, joinMeeting, userId]);

  // 위치 추가 시 Socket 사용
  const handleAddLocation = (location: LocationData) => {
    addLocation(location);
    // Optimistic UI 업데이트는 useMeetingSocket이 자동 처리
  };

  return (
    <div>
      {/* 연결 상태 표시 */}
      <div className="fixed top-4 right-4 z-50">
        {isConnected ? (
          <div className="flex items-center gap-2 bg-green-100 text-green-800 px-3 py-1 rounded-full">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm">실시간 연결됨</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-red-100 text-red-800 px-3 py-1 rounded-full">
            <span className="w-2 h-2 bg-red-500 rounded-full" />
            <span className="text-sm">연결 끊김</span>
          </div>
        )}
      </div>

      {/* 나머지 UI */}
    </div>
  );
}
```

---

## 📈 성능 최적화 전략

### Redis 활용

```typescript
// 세션 상태 캐싱
const meetingState = await cache.get(`meeting:${meetingCode}`);
if (!meetingState) {
  const state = await database.getMeeting(meetingCode);
  await cache.set(`meeting:${meetingCode}`, state, 3600); // 1시간 TTL
}

// 실시간 참가자 수 추적
await cache.incr(`meeting:${meetingCode}:participants`);
await cache.expire(`meeting:${meetingCode}:participants`, 3600);
```

### 이벤트 배칭

```typescript
// 빈번한 투표 이벤트를 0.5초마다 배칭
let voteBuffer: Vote[] = [];
setInterval(() => {
  if (voteBuffer.length > 0) {
    io.to(roomName).emit("vote:batch", voteBuffer);
    voteBuffer = [];
  }
}, 500);
```

### 연결 제한

```typescript
// 미팅당 최대 참가자 수 제한
const participantCount = await cache.get(`meeting:${meetingCode}:count`);
if (participantCount >= 10) {
  socket.emit("error", {
    code: "ROOM_FULL",
    message: "미팅 인원이 가득 찼습니다.",
  });
  return;
}
```

---

## 🔒 보안 고려사항

### 인증/인가

```typescript
// Socket.io 미들웨어로 Device ID 검증
namespace.use((socket, next) => {
  const deviceId = socket.handshake.auth.deviceId;
  if (!deviceId || !isValidDeviceId(deviceId)) {
    return next(new Error("Authentication failed"));
  }
  socket.data.deviceId = deviceId;
  next();
});
```

### Rate Limiting

```typescript
// 개별 소켓당 이벤트 제한
const rateLimiter = new Map<string, number>();

socket.on("location:add", (data) => {
  const key = `${socket.id}:location:add`;
  const count = rateLimiter.get(key) || 0;

  if (count > 10) {
    socket.emit("error", {
      code: "RATE_LIMIT",
      message: "너무 많은 요청입니다.",
    });
    return;
  }

  rateLimiter.set(key, count + 1);
  setTimeout(() => rateLimiter.delete(key), 60000); // 1분 후 리셋

  // 처리...
});
```

### 데이터 검증

```typescript
// 모든 이벤트 데이터 Zod 스키마 검증
socket.on("location:add", (data) => {
  try {
    const validated = AddLocationSchema.parse(data);
    // 처리...
  } catch (error) {
    socket.emit("error", {
      code: "INVALID_DATA",
      message: "잘못된 데이터 형식입니다.",
    });
  }
});
```

---

## 📊 테스트 전략

### 단위 테스트

```typescript
// Socket 이벤트 핸들러 테스트
import { describe, it, expect } from "vitest";
import { createMockSocket } from "./test-utils";

describe("Meeting Socket Handlers", () => {
  it("should join meeting room", async () => {
    const mockSocket = createMockSocket();
    await handleJoinMeeting(mockSocket, {
      meetingCode: "ABC123",
      userId: "user-1",
      name: "Test User",
    });

    expect(mockSocket.join).toHaveBeenCalledWith("room:ABC123");
    expect(mockSocket.to).toHaveBeenCalledWith("room:ABC123");
  });

  it("should validate meeting code format", async () => {
    const mockSocket = createMockSocket();
    await handleJoinMeeting(mockSocket, {
      meetingCode: "invalid",
      userId: "user-1",
      name: "Test",
    });

    expect(mockSocket.emit).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({ code: "JOIN_FAILED" })
    );
  });
});
```

### 통합 테스트

```typescript
// Socket.io 클라이언트로 E2E 테스트
import { io as ioClient } from "socket.io-client";

describe("Socket Integration Tests", () => {
  it("should sync location updates between clients", (done) => {
    const client1 = ioClient("http://localhost:5000/meetings");
    const client2 = ioClient("http://localhost:5000/meetings");

    const testLocation = {
      name: "Test Location",
      lat: 37.5665,
      lng: 126.978,
    };

    // Client 2가 이벤트 수신 대기
    client2.on("location:added", (data) => {
      expect(data.location).toMatchObject(testLocation);
      client1.disconnect();
      client2.disconnect();
      done();
    });

    // Client 1이 위치 추가
    client1.emit("location:add", {
      meetingCode: "ABC123",
      location: testLocation,
    });
  });
});
```

---

## 🚀 구현 우선순위

### **Week 1-2: 핵심 기능**

- [ ] Backend: Socket.io 서버 설정 및 Redis Adapter 연결
- [ ] Backend: 미팅 참가/퇴장 이벤트 구현
- [ ] Backend: 위치 추가/수정/삭제 이벤트 구현
- [ ] Backend: 중간지점 재계산 로직 통합
- [ ] Frontend: SocketContext 및 Provider 작성
- [ ] Frontend: useMeetingSocket Hook 구현
- [ ] Frontend: home.tsx에 실시간 기능 통합
- [ ] 통합 테스트 및 버그 수정

### **Week 3: 투표 시스템**

- [ ] Backend: 투표 이벤트 핸들러 구현
- [ ] Backend: 투표 현황 집계 로직
- [ ] Frontend: 실시간 투표 UI 통합
- [ ] Frontend: 투표 현황 실시간 업데이트
- [ ] 투표 결과 알림 시스템

### **Week 4: 최적화 및 안정성**

- [ ] 성능 테스트 및 최적화
- [ ] 재연결 로직 강화
- [ ] 에러 핸들링 개선
- [ ] 모니터링 대시보드 구축
- [ ] 문서화 완료

---

## 📁 파일 구조

### Backend

```
meet_here_api/src/
├── socket/
│   ├── index.ts                  # Socket.io 서버 설정
│   ├── types.ts                  # Socket 이벤트 타입 정의
│   ├── middleware/
│   │   ├── auth.ts              # Socket 인증 미들웨어
│   │   └── rateLimiter.ts       # Rate Limiting
│   └── handlers/
│       ├── meetingHandler.ts    # 미팅 관련 이벤트
│       ├── locationHandler.ts   # 위치 관련 이벤트
│       └── voteHandler.ts       # 투표 관련 이벤트
└── app.ts                        # Express + Socket.io 통합
```

### Frontend

```
meet_here_client/client/src/
├── contexts/
│   └── SocketContext.tsx         # Socket Context & Provider
├── hooks/
│   └── useMeetingSocket.ts       # Socket Hook
├── types/
│   └── socket.ts                 # Socket 이벤트 타입
└── pages/
    └── home.tsx                  # Socket 통합 UI
```

---

## ✅ 최종 체크리스트

### Backend

- [ ] Socket.io 서버 구축
- [ ] Redis Adapter 연결
- [ ] 이벤트 핸들러 구현
- [ ] 인증/인가 미들웨어
- [ ] Rate Limiting
- [ ] 데이터 검증 (Zod)
- [ ] 단위 테스트 작성
- [ ] API 문서화

### Frontend

- [ ] SocketContext 및 Provider
- [ ] useMeetingSocket Hook
- [ ] 타입 정의
- [ ] UI 컴포넌트 통합
- [ ] 연결 상태 표시
- [ ] 에러 핸들링
- [ ] 통합 테스트
- [ ] 사용자 가이드

### 성능 및 보안

- [ ] Redis 캐싱 전략
- [ ] 이벤트 배칭
- [ ] 연결 제한
- [ ] 데이터 검증
- [ ] Rate Limiting
- [ ] 모니터링 설정

---

## 📝 다음 단계

1. **별도 브랜치 생성**

   ```bash
   git checkout -b feature/websocket-realtime
   ```

2. **Backend 구현 시작**

   ```bash
   cd meet_here_api
   npm install socket.io @socket.io/redis-adapter
   ```

3. **Frontend 구현 시작**

   ```bash
   cd meet_here_client
   npm install socket.io-client
   ```

4. **통합 테스트**
   - 2개의 브라우저 창에서 동시 접속 테스트
   - 위치 추가/삭제 실시간 동기화 확인
   - 투표 기능 실시간 업데이트 확인

---

**작성자**: Main Agent
**최종 수정일**: 2025-11-04
**버전**: 1.0
