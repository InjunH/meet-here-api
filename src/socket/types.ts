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
}

export interface ServerToClientEvents {
  'meeting:joined': (data: ParticipantJoinedData) => void;
  'meeting:left': (data: ParticipantLeftData) => void;
  'meeting:state': (data: MeetingStateData) => void;
  'location:added': (data: LocationAddedData) => void;
  'error': (data: ErrorData) => void;
}

export interface SocketData {
  userId?: string;
  meetingCode?: string;
  userName?: string;
}
