/**
 * @fileoverview Drizzle ORM 데이터베이스 스키마 정의
 * PostgreSQL 테이블 구조 및 관계 설정
 */

import { pgTable, text, timestamp, uuid, jsonb, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================
// 1. Sessions 테이블 - 미팅 세션 정보
// ============================================
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  hostName: text('host_name').notNull(),
  status: text('status').notNull().default('active'), // 'active' | 'voting' | 'completed' | 'cancelled'

  // 중간지점 정보
  centerLat: text('center_lat'),
  centerLng: text('center_lng'),
  centerDisplayName: text('center_display_name'),

  // 최종 선택된 장소
  selectedPlaceId: uuid('selected_place_id'),

  // 타임스탬프
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  expiresAt: timestamp('expires_at').notNull(), // 24시간 후 자동 만료
}, (table) => ({
  statusIdx: index('sessions_status_idx').on(table.status, table.createdAt),
  expiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),
}));

// ============================================
// 2. Participants 테이블 - 참가자 정보
// ============================================
export const participants = pgTable('participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),

  // 참가자 정보
  name: text('name').notNull(),

  // 위치 정보 (최종 스냅샷)
  locationLat: text('location_lat').notNull(),
  locationLng: text('location_lng').notNull(),
  locationDisplayName: text('location_display_name'),

  // 타임스탬프
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
  lastActiveAt: timestamp('last_active_at').notNull().defaultNow(),
}, (table) => ({
  sessionIdx: index('participants_session_idx').on(table.sessionId),
}));

// ============================================
// 3. Recommended Places 테이블 - 추천된 장소들
// ============================================
export const recommendedPlaces = pgTable('recommended_places', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),

  // 외부 API 정보
  externalId: text('external_id').notNull(), // 네이버 API의 장소 ID

  // 장소 정보
  name: text('name').notNull(),
  category: text('category').notNull(),
  address: text('address').notNull(),
  roadAddress: text('road_address'),

  // 좌표
  lat: text('lat').notNull(),
  lng: text('lng').notNull(),

  // 거리 정보
  distance: integer('distance').notNull(), // 중간지점으로부터 거리 (미터)

  // 추가 메타데이터 (전화번호, URL 등)
  metadata: jsonb('metadata'),

  // 타임스탬프
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  sessionIdx: index('places_session_idx').on(table.sessionId),
  sessionExternalIdx: uniqueIndex('places_session_external_idx').on(table.sessionId, table.externalId),
}));

// ============================================
// 4. Votes 테이블 - 투표 기록
// ============================================
export const votes = pgTable('votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  participantId: uuid('participant_id').notNull().references(() => participants.id, { onDelete: 'cascade' }),
  placeId: uuid('place_id').notNull().references(() => recommendedPlaces.id, { onDelete: 'cascade' }),

  // 타임스탬프
  votedAt: timestamp('voted_at').notNull().defaultNow(),
}, (table) => ({
  sessionPlaceIdx: index('votes_session_place_idx').on(table.sessionId, table.placeId),
  participantUniqueIdx: uniqueIndex('votes_participant_unique_idx').on(table.sessionId, table.participantId),
}));

// ============================================
// Relations (Drizzle ORM 관계 정의)
// ============================================

export const sessionsRelations = relations(sessions, ({ many, one }) => ({
  participants: many(participants),
  recommendedPlaces: many(recommendedPlaces),
  votes: many(votes),
  selectedPlace: one(recommendedPlaces, {
    fields: [sessions.selectedPlaceId],
    references: [recommendedPlaces.id],
  }),
}));

export const participantsRelations = relations(participants, ({ one, many }) => ({
  session: one(sessions, {
    fields: [participants.sessionId],
    references: [sessions.id],
  }),
  votes: many(votes),
}));

export const recommendedPlacesRelations = relations(recommendedPlaces, ({ one, many }) => ({
  session: one(sessions, {
    fields: [recommendedPlaces.sessionId],
    references: [sessions.id],
  }),
  votes: many(votes),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  session: one(sessions, {
    fields: [votes.sessionId],
    references: [sessions.id],
  }),
  participant: one(participants, {
    fields: [votes.participantId],
    references: [participants.id],
  }),
  place: one(recommendedPlaces, {
    fields: [votes.placeId],
    references: [recommendedPlaces.id],
  }),
}));

// ============================================
// TypeScript Types (추론된 타입)
// ============================================

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;

export type RecommendedPlace = typeof recommendedPlaces.$inferSelect;
export type NewRecommendedPlace = typeof recommendedPlaces.$inferInsert;

export type Vote = typeof votes.$inferSelect;
export type NewVote = typeof votes.$inferInsert;
