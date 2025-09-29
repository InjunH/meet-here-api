/**
 * @fileoverview 중간지점 계산 세션 Repository 인터페이스 및 구현
 */

import type {
  MeetingPointRequest,
  MeetingPointResponse,
  ParticipantLocation,
  MeetingCenter,
  Point
} from '@/types/subway.js';
import type { BaseRepository, PaginatedResult, PaginationOptions } from './base.repository.js';

/**
 * 중간지점 계산 세션 데이터 모델
 */
export interface MeetingSession {
  id: string;
  name?: string;
  participants: ParticipantLocation[];
  calculatedCenter: MeetingCenter;
  nearbyStations: any[];
  stats: {
    averageDistance: number;
    maxDistance: number;
    minDistance: number;
  };
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

/**
 * 중간지점 Repository 인터페이스
 */
export interface IMeetingPointRepository extends BaseRepository<MeetingSession> {
  /**
   * 세션 이름으로 검색
   * @param name 세션 이름
   * @returns 세션 목록
   */
  findByName(name: string): Promise<MeetingSession[]>;

  /**
   * 참가자 정보가 포함된 세션 검색
   * @param participantName 참가자명
   * @returns 해당 참가자가 포함된 세션들
   */
  findByParticipant(participantName: string): Promise<MeetingSession[]>;

  /**
   * 특정 지역 내 중심점을 가진 세션 검색
   * @param bounds 지역 경계
   * @returns 해당 지역의 세션들
   */
  findByRegion(bounds: { northeast: Point; southwest: Point }): Promise<MeetingSession[]>;

  /**
   * 만료된 세션 정리
   * @returns 정리된 세션 개수
   */
  cleanExpiredSessions(): Promise<number>;

  /**
   * 최근 생성된 세션들 조회
   * @param limit 개수 제한
   * @returns 최근 세션들
   */
  findRecent(limit?: number): Promise<MeetingSession[]>;

  /**
   * 활성 세션 통계
   * @returns 활성 세션 통계 정보
   */
  getActiveSessionStats(): Promise<{
    totalSessions: number;
    totalParticipants: number;
    averageParticipantsPerSession: number;
    mostActiveRegion: Point | null;
  }>;

  /**
   * 세션 만료 시간 연장
   * @param id 세션 ID
   * @param extendHours 연장 시간 (시간 단위)
   * @returns 업데이트된 세션
   */
  extendSession(id: string, extendHours: number): Promise<MeetingSession>;
}

/**
 * In-Memory 중간지점 Repository 구현
 */
export class InMemoryMeetingPointRepository implements IMeetingPointRepository {
  private sessions: Map<string, MeetingSession> = new Map();
  private idCounter: number = 1;

  private generateId(): string {
    return `session_${this.idCounter++}_${Date.now()}`;
  }

  async findById(id: string): Promise<MeetingSession | null> {
    const session = this.sessions.get(id);
    if (!session) return null;

    // 만료 체크
    if (session.expiresAt && session.expiresAt < new Date()) {
      await this.delete(id);
      return null;
    }

    return session;
  }

  async findAll(): Promise<MeetingSession[]> {
    // 만료된 세션들 자동 정리
    await this.cleanExpiredSessions();
    return Array.from(this.sessions.values());
  }

  async create(data: Omit<MeetingSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<MeetingSession> {
    const id = this.generateId();
    const now = new Date();

    const session: MeetingSession = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      // 기본 7일 후 만료
      expiresAt: data.expiresAt || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    };

    this.sessions.set(id, session);
    return session;
  }

  async update(id: string, data: Partial<MeetingSession>): Promise<MeetingSession> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Meeting session with id ${id} not found`);
    }

    const updated: MeetingSession = {
      ...existing,
      ...data,
      id: existing.id, // ID는 변경 불가
      createdAt: existing.createdAt, // 생성일은 변경 불가
      updatedAt: new Date()
    };

    this.sessions.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async findByName(name: string): Promise<MeetingSession[]> {
    await this.cleanExpiredSessions();
    const sessions = Array.from(this.sessions.values());

    return sessions.filter(session =>
      session.name && session.name.includes(name)
    );
  }

  async findByParticipant(participantName: string): Promise<MeetingSession[]> {
    await this.cleanExpiredSessions();
    const sessions = Array.from(this.sessions.values());

    return sessions.filter(session =>
      session.participants.some(participant =>
        participant.name.includes(participantName)
      )
    );
  }

  async findByRegion(bounds: { northeast: Point; southwest: Point }): Promise<MeetingSession[]> {
    await this.cleanExpiredSessions();
    const sessions = Array.from(this.sessions.values());

    return sessions.filter(session => {
      const center = session.calculatedCenter;
      return (
        center.lat >= bounds.southwest.lat &&
        center.lat <= bounds.northeast.lat &&
        center.lng >= bounds.southwest.lng &&
        center.lng <= bounds.northeast.lng
      );
    });
  }

  async cleanExpiredSessions(): Promise<number> {
    const now = new Date();
    const sessionsToDelete: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt && session.expiresAt < now) {
        sessionsToDelete.push(id);
      }
    }

    sessionsToDelete.forEach(id => this.sessions.delete(id));
    return sessionsToDelete.length;
  }

  async findRecent(limit: number = 10): Promise<MeetingSession[]> {
    await this.cleanExpiredSessions();
    const sessions = Array.from(this.sessions.values());

    return sessions
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async getActiveSessionStats(): Promise<{
    totalSessions: number;
    totalParticipants: number;
    averageParticipantsPerSession: number;
    mostActiveRegion: Point | null;
  }> {
    await this.cleanExpiredSessions();
    const sessions = Array.from(this.sessions.values());

    const totalSessions = sessions.length;
    const totalParticipants = sessions.reduce(
      (sum, session) => sum + session.participants.length,
      0
    );

    const averageParticipantsPerSession = totalSessions > 0
      ? totalParticipants / totalSessions
      : 0;

    // 가장 활성 지역 계산 (간단한 구현)
    let mostActiveRegion: Point | null = null;
    if (sessions.length > 0) {
      const centers = sessions.map(session => session.calculatedCenter);
      const avgLat = centers.reduce((sum, center) => sum + center.lat, 0) / centers.length;
      const avgLng = centers.reduce((sum, center) => sum + center.lng, 0) / centers.length;
      mostActiveRegion = { lat: avgLat, lng: avgLng };
    }

    return {
      totalSessions,
      totalParticipants,
      averageParticipantsPerSession,
      mostActiveRegion
    };
  }

  async extendSession(id: string, extendHours: number): Promise<MeetingSession> {
    const session = await this.findById(id);
    if (!session) {
      throw new Error(`Meeting session with id ${id} not found`);
    }

    const currentExpiry = session.expiresAt || new Date();
    const newExpiry = new Date(currentExpiry.getTime() + extendHours * 60 * 60 * 1000);

    return await this.update(id, { expiresAt: newExpiry });
  }

  /**
   * 페이지네이션과 함께 세션 목록 조회
   */
  async findWithPagination(options: PaginationOptions): Promise<PaginatedResult<MeetingSession>> {
    await this.cleanExpiredSessions();
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = options;

    let sessions = Array.from(this.sessions.values());

    // 정렬
    sessions.sort((a, b) => {
      const aValue = (a as any)[sortBy] || '';
      const bValue = (b as any)[sortBy] || '';

      // Date 타입 처리
      if (aValue instanceof Date && bValue instanceof Date) {
        return sortOrder === 'desc'
          ? bValue.getTime() - aValue.getTime()
          : aValue.getTime() - bValue.getTime();
      }

      // 문자열/숫자 처리
      if (sortOrder === 'desc') {
        return bValue.toString().localeCompare(aValue.toString());
      }
      return aValue.toString().localeCompare(bValue.toString());
    });

    // 페이지네이션
    const total = sessions.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const data = sessions.slice(startIndex, endIndex);

    return {
      data,
      total,
      page,
      limit,
      hasNext: endIndex < total,
      hasPrev: page > 1
    };
  }

  /**
   * 전체 세션 개수 (만료된 것 제외)
   */
  async getSessionCount(): Promise<number> {
    await this.cleanExpiredSessions();
    return this.sessions.size;
  }

  /**
   * 특정 날짜 범위의 세션들 조회
   */
  async findByDateRange(startDate: Date, endDate: Date): Promise<MeetingSession[]> {
    await this.cleanExpiredSessions();
    const sessions = Array.from(this.sessions.values());

    return sessions.filter(session =>
      session.createdAt >= startDate && session.createdAt <= endDate
    );
  }

  /**
   * 세션 데이터 내보내기 (JSON)
   */
  async exportSessions(): Promise<MeetingSession[]> {
    await this.cleanExpiredSessions();
    return Array.from(this.sessions.values());
  }

  /**
   * 세션 데이터 가져오기 (JSON)
   */
  async importSessions(sessions: MeetingSession[]): Promise<number> {
    let importedCount = 0;

    for (const session of sessions) {
      // 중복 체크
      if (!this.sessions.has(session.id)) {
        this.sessions.set(session.id, session);
        importedCount++;
      }
    }

    return importedCount;
  }
}