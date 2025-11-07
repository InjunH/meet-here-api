/**
 * Socket.io 이벤트 타입 정의
 * 프로토타입 버전: 미팅 참가 및 위치 추가 기능만 포함
 */

// ===== Client → Server 이벤트 =====

export interface JoinMeetingData {
  meetingCode: string;
  userId: string;
  name: string;
}

export interface AddLocationData {
  meetingCode: string;
  location: {
    name: string;
    address: string;
    lat: number;
    lng: number;
  };
}

export interface LeaveMeetingData {
  meetingCode: string;
  userId: string;
}

// ===== Server → Client 이벤트 =====

export interface ParticipantJoinedData {
  userId: string;
  name: string;
  timestamp: string;
}

export interface ParticipantLeftData {
  userId: string;
  name: string;
  timestamp: string;
}

export interface MeetingStateData {
  meetingCode: string;
  participants: Array<{
    userId: string;
    name: string;
  }>;
  locations: Array<{
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    userId: string;
  }>;
  centerPoint?: {
    lat: number;
    lng: number;
  };
}

export interface LocationAddedData {
  location: {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    userId: string;
  };
  centerPoint: {
    lat: number;
    lng: number;
  };
}

export interface ErrorData {
  code: string;
  message: string;
  timestamp: string;
}

// ===== Socket 타입 정의 =====

export interface ClientToServerEvents {
  'meeting:join': (data: JoinMeetingData) => void;
  'meeting:leave': (data: LeaveMeetingData) => void;
  'location:add': (data: AddLocationData) => void;
  // 새 API 이벤트
  'session:join': (data: { sessionId: string; participantId: string }) => void;
  'vote:cast': (data: CastVoteData) => void;
}

export interface ServerToClientEvents {
  'meeting:joined': (data: ParticipantJoinedData) => void;
  'meeting:left': (data: ParticipantLeftData) => void;
  'meeting:state': (data: MeetingStateData) => void;
  'location:added': (data: LocationAddedData) => void;
  'error': (data: ErrorData) => void;
  // 새 API 이벤트
  'vote:casted': (data: VoteCastedData) => void;
  'vote:status': (data: VoteStatusData) => void;
  'participant:location:updated': (data: ParticipantLocationUpdatedData) => void;
  'session:status:changed': (data: SessionStatusChangedData) => void;
}

export interface SocketData {
  userId?: string;
  meetingCode?: string;
  userName?: string;
  sessionId?: string;
  participantId?: string;
}

// ===== 투표 관련 이벤트 (새 API용) =====

export interface CastVoteData {
  sessionId: string;
  participantId: string;
  placeId: string;
}

export interface VoteCastedData {
  sessionId: string;
  participantId: string;
  placeId: string;
  timestamp: string;
}

export interface VoteStatusData {
  sessionId: string;
  totalVotes: number;
  results: Array<{
    placeId: string;
    voteCount: number;
    voters: string[];
  }>;
}

export interface ParticipantLocationUpdatedData {
  sessionId: string;
  participantId: string;
  location: {
    lat: string;
    lng: string;
    displayName?: string;
  };
  timestamp: string;
}

export interface SessionStatusChangedData {
  sessionId: string;
  status: 'active' | 'voting' | 'completed' | 'cancelled';
  timestamp: string;
}
