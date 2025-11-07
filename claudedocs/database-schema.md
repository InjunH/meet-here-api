# 데이터베이스 스키마 문서

MeetHere 프로젝트의 PostgreSQL 데이터베이스 스키마 상세 문서

## 📋 목차
- [개요](#개요)
- [테이블 구조](#테이블-구조)
- [관계 다이어그램](#관계-다이어그램)
- [인덱스 전략](#인덱스-전략)
- [데이터 무결성](#데이터-무결성)

---

## 개요

### 데이터베이스 정보
- **DBMS**: PostgreSQL 14+
- **ORM**: Drizzle ORM
- **하이브리드 아키텍처**: Redis (실시간 캐시) + PostgreSQL (영구 저장)
- **연결 정보**: `DATABASE_URL=postgresql://meethere:meethere2024@localhost:5432/meethere`

### 설계 원칙
1. **CASCADE 삭제**: 세션 삭제 시 관련 데이터 자동 정리
2. **UUID 기반 ID**: 분산 시스템 호환
3. **인덱스 최적화**: 주요 쿼리 패턴 최적화
4. **타임스탬프 자동화**: 생성/수정 시간 자동 기록

---

## 테이블 구조

### 1. sessions (세션)

만남 세션의 메타데이터를 저장하는 핵심 테이블

```sql
CREATE TABLE sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  host_name           TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  center_lat          TEXT,
  center_lng          TEXT,
  center_display_name TEXT,
  selected_place_id   UUID,
  created_at          TIMESTAMP NOT NULL DEFAULT now(),
  completed_at        TIMESTAMP,
  expires_at          TIMESTAMP NOT NULL
);
```

#### 컬럼 설명

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK | 세션 고유 식별자 |
| `title` | TEXT | NOT NULL | 세션 제목 (예: "강남역에서 만나요") |
| `host_name` | TEXT | NOT NULL | 세션 생성자 이름 |
| `status` | TEXT | NOT NULL | 세션 상태: `active`, `voting`, `completed`, `cancelled` |
| `center_lat` | TEXT | NULLABLE | 중간지점 위도 (계산 후 저장) |
| `center_lng` | TEXT | NULLABLE | 중간지점 경도 (계산 후 저장) |
| `center_display_name` | TEXT | NULLABLE | 중간지점 지역명 (예: "명동역") |
| `selected_place_id` | UUID | NULLABLE | 최종 선택된 장소 ID |
| `created_at` | TIMESTAMP | NOT NULL | 세션 생성 시간 |
| `completed_at` | TIMESTAMP | NULLABLE | 세션 완료 시간 |
| `expires_at` | TIMESTAMP | NOT NULL | 세션 만료 시간 (생성 후 24시간) |

#### 인덱스

```sql
-- 기본 키
CREATE INDEX sessions_pkey ON sessions(id);

-- 만료 시간 조회 (배치 작업용)
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

-- 상태별 최신 세션 조회
CREATE INDEX sessions_status_idx ON sessions(status, created_at);
```

#### 비즈니스 로직
- **TTL**: 24시간 후 자동 만료
- **상태 전환**: `active` → `voting` → `completed`
- **중간지점 계산**: 참가자 위치 기반 자동 계산 후 저장

---

### 2. participants (참가자)

세션 참가자 정보 및 위치 데이터

```sql
CREATE TABLE participants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL,
  name                  TEXT NOT NULL,
  location_lat          TEXT NOT NULL,
  location_lng          TEXT NOT NULL,
  location_display_name TEXT,
  joined_at             TIMESTAMP NOT NULL DEFAULT now(),
  last_active_at        TIMESTAMP NOT NULL DEFAULT now(),

  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

#### 컬럼 설명

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK | 참가자 고유 식별자 |
| `session_id` | UUID | FK, NOT NULL | 소속 세션 ID |
| `name` | TEXT | NOT NULL | 참가자 이름 |
| `location_lat` | TEXT | NOT NULL | 참가자 위치 위도 |
| `location_lng` | TEXT | NOT NULL | 참가자 위치 경도 |
| `location_display_name` | TEXT | NULLABLE | 위치 표시명 (예: "강남역") |
| `joined_at` | TIMESTAMP | NOT NULL | 세션 참가 시간 |
| `last_active_at` | TIMESTAMP | NOT NULL | 마지막 활동 시간 (heartbeat) |

#### 인덱스

```sql
-- 세션별 참가자 조회 최적화
CREATE INDEX participants_session_idx ON participants(session_id);
```

#### 비즈니스 로직
- **위치 업데이트**: 실시간 위치 변경 지원
- **Heartbeat**: `last_active_at` 주기적 업데이트
- **CASCADE 삭제**: 세션 삭제 시 참가자도 삭제

---

### 3. recommended_places (추천 장소)

중간지점 기반 추천 장소 데이터

```sql
CREATE TABLE recommended_places (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL,
  external_id  TEXT NOT NULL,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,
  address      TEXT NOT NULL,
  road_address TEXT,
  lat          TEXT NOT NULL,
  lng          TEXT NOT NULL,
  distance     INTEGER NOT NULL,
  metadata     JSONB,
  created_at   TIMESTAMP NOT NULL DEFAULT now(),

  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE (session_id, external_id)
);
```

#### 컬럼 설명

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK | 장소 고유 식별자 |
| `session_id` | UUID | FK, NOT NULL | 소속 세션 ID |
| `external_id` | TEXT | NOT NULL | 외부 API 장소 ID (네이버 place_id) |
| `name` | TEXT | NOT NULL | 장소명 |
| `category` | TEXT | NOT NULL | 카테고리 (CAFE, RESTAURANT 등) |
| `address` | TEXT | NOT NULL | 지번 주소 |
| `road_address` | TEXT | NULLABLE | 도로명 주소 |
| `lat` | TEXT | NOT NULL | 장소 위도 |
| `lng` | TEXT | NOT NULL | 장소 경도 |
| `distance` | INTEGER | NOT NULL | 중간지점으로부터 거리 (미터) |
| `metadata` | JSONB | NULLABLE | 추가 정보 (평점, 리뷰 수 등) |
| `created_at` | TIMESTAMP | NOT NULL | 추천 생성 시간 |

#### 인덱스

```sql
-- 세션 + 외부ID 중복 방지
CREATE UNIQUE INDEX places_session_external_idx
ON recommended_places(session_id, external_id);

-- 세션별 장소 조회
CREATE INDEX places_session_idx ON recommended_places(session_id);
```

#### 비즈니스 로직
- **중복 방지**: 같은 세션에 같은 장소 중복 저장 방지
- **JSONB 메타데이터**: 평점, 리뷰 수, 영업시간 등 유연한 데이터 저장
- **거리 정렬**: 중간지점으로부터 가까운 순

---

### 4. votes (투표)

참가자의 장소 투표 기록

```sql
CREATE TABLE votes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL,
  participant_id UUID NOT NULL,
  place_id       UUID NOT NULL,
  voted_at       TIMESTAMP NOT NULL DEFAULT now(),

  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  FOREIGN KEY (place_id) REFERENCES recommended_places(id) ON DELETE CASCADE,
  UNIQUE (session_id, participant_id)
);
```

#### 컬럼 설명

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK | 투표 고유 식별자 |
| `session_id` | UUID | FK, NOT NULL | 소속 세션 ID |
| `participant_id` | UUID | FK, NOT NULL | 투표자 ID |
| `place_id` | UUID | FK, NOT NULL | 투표한 장소 ID |
| `voted_at` | TIMESTAMP | NOT NULL | 투표 시간 |

#### 인덱스

```sql
-- 참가자당 1표 제약
CREATE UNIQUE INDEX votes_participant_unique_idx
ON votes(session_id, participant_id);

-- 장소별 투표 집계 최적화
CREATE INDEX votes_session_place_idx ON votes(session_id, place_id);
```

#### 비즈니스 로직
- **1인 1표**: 참가자당 하나의 장소만 투표 가능
- **재투표**: 기존 투표 삭제 후 새 투표 저장
- **실시간 집계**: Redis에서 빠른 집계, PostgreSQL에 영구 저장

---

## 관계 다이어그램

```
┌─────────────────────────────────────────────────────────┐
│                       sessions (1)                       │
│  - id (PK)                                              │
│  - title, host_name, status                             │
│  - center_lat, center_lng, center_display_name          │
│  - selected_place_id                                    │
│  - created_at, completed_at, expires_at                 │
└───────┬─────────────────┬────────────────┬──────────────┘
        │                 │                │
        │ CASCADE         │ CASCADE        │ CASCADE
        ▼                 ▼                ▼
┌───────────────┐  ┌──────────────────┐  ┌─────────────┐
│participants(N)│  │recommended_     │  │  votes (N)  │
│- id (PK)      │  │  places (N)     │  │- id (PK)    │
│- session_id(FK)│  │- id (PK)        │  │- session_id │
│- name         │  │- session_id(FK) │  │- participant│
│- location_*   │  │- external_id    │  │- place_id   │
│- joined_at    │  │- name, category │  │- voted_at   │
└───────┬───────┘  │- address, lat   │  └─────────────┘
        │          │- distance       │         ▲
        │ CASCADE  │- metadata(JSONB)│         │
        │          └────────┬─────────┘         │
        │                   │                   │
        │                   │ CASCADE           │
        └───────────────────┴───────────────────┘
```

### 관계 설명

#### 1. sessions → participants (1:N)
- **관계**: 하나의 세션에 여러 참가자
- **삭제 정책**: CASCADE (세션 삭제 시 참가자도 삭제)
- **쿼리**: `session_id` 인덱스로 최적화

#### 2. sessions → recommended_places (1:N)
- **관계**: 하나의 세션에 여러 추천 장소
- **삭제 정책**: CASCADE
- **유니크 제약**: `(session_id, external_id)` 중복 방지

#### 3. sessions → votes (1:N)
- **관계**: 하나의 세션에 여러 투표
- **삭제 정책**: CASCADE
- **유니크 제약**: `(session_id, participant_id)` 1인 1표

#### 4. participants → votes (1:N)
- **관계**: 하나의 참가자가 여러 세션에서 투표 (실제로는 1:1)
- **삭제 정책**: CASCADE

#### 5. recommended_places → votes (1:N)
- **관계**: 하나의 장소에 여러 투표
- **삭제 정책**: CASCADE

---

## 인덱스 전략

### 1. 기본 키 인덱스 (자동 생성)
```sql
sessions_pkey              ON sessions(id)
participants_pkey          ON participants(id)
recommended_places_pkey    ON recommended_places(id)
votes_pkey                 ON votes(id)
```

### 2. 외래 키 인덱스
```sql
-- 세션별 참가자 조회
participants_session_idx ON participants(session_id)

-- 세션별 장소 조회
places_session_idx ON recommended_places(session_id)
```

### 3. 비즈니스 로직 인덱스
```sql
-- 만료 세션 배치 삭제
sessions_expires_at_idx ON sessions(expires_at)

-- 상태별 최신 세션
sessions_status_idx ON sessions(status, created_at)

-- 참가자당 1표 제약
votes_participant_unique_idx ON votes(session_id, participant_id) UNIQUE

-- 장소별 투표 집계
votes_session_place_idx ON votes(session_id, place_id)

-- 세션+장소 중복 방지
places_session_external_idx ON recommended_places(session_id, external_id) UNIQUE
```

### 쿼리 최적화 시나리오

#### 1. 세션 참가자 목록 조회
```sql
SELECT * FROM participants
WHERE session_id = '...'
ORDER BY joined_at;
-- → participants_session_idx 사용
```

#### 2. 투표 현황 집계
```sql
SELECT place_id, COUNT(*) as vote_count
FROM votes
WHERE session_id = '...'
GROUP BY place_id;
-- → votes_session_place_idx 사용
```

#### 3. 만료된 세션 삭제
```sql
DELETE FROM sessions
WHERE expires_at < NOW();
-- → sessions_expires_at_idx 사용
```

---

## 데이터 무결성

### 1. Foreign Key Constraints

모든 외래 키는 `ON DELETE CASCADE` 설정:
- 세션 삭제 → 참가자, 장소, 투표 자동 삭제
- 참가자 삭제 → 해당 참가자의 투표 자동 삭제
- 장소 삭제 → 해당 장소에 대한 투표 자동 삭제

### 2. Unique Constraints

#### `votes_participant_unique_idx`
```sql
UNIQUE (session_id, participant_id)
```
- **목적**: 참가자당 1표 제약
- **동작**: 같은 참가자가 같은 세션에 2번 투표 시도 시 에러

#### `places_session_external_idx`
```sql
UNIQUE (session_id, external_id)
```
- **목적**: 같은 세션에 동일 장소 중복 저장 방지
- **동작**: 외부 API에서 가져온 장소 중복 방지

### 3. NOT NULL Constraints

필수 데이터 누락 방지:
- `sessions.title`, `sessions.host_name`
- `participants.name`, `participants.location_*`
- `recommended_places.name`, `recommended_places.external_id`
- `votes.session_id`, `votes.participant_id`, `votes.place_id`

### 4. 기본값 (DEFAULT)

자동 설정 값:
```sql
id         : gen_random_uuid()  -- UUID 자동 생성
status     : 'active'           -- 세션 초기 상태
created_at : now()              -- 현재 시간
joined_at  : now()              -- 현재 시간
voted_at   : now()              -- 현재 시간
```

---

## 마이그레이션 관리

### Drizzle Kit 명령어

```bash
# 스키마 변경사항 감지 및 마이그레이션 파일 생성
npm run db:generate

# 마이그레이션 실행
npm run db:migrate

# 개발 환경 직접 푸시 (마이그레이션 파일 없이)
npm run db:push

# Drizzle Studio 실행 (GUI)
npm run db:studio
```

### 마이그레이션 파일 위치
```
drizzle/
├── meta/
│   └── _journal.json
└── 0000_initial.sql
```

---

## 성능 고려사항

### 1. Redis 캐싱 전략

**캐시 대상**:
- 세션 정보 (TTL: 24시간)
- 참가자 목록 및 위치
- 투표 현황 (실시간 집계)

**캐시 키 구조**:
```
session:{sessionId}                      -- 세션 정보
session:{sessionId}:participants         -- 참가자 목록
session:{sessionId}:participant:{id}     -- 개별 참가자
session:{sessionId}:location:{id}        -- 참가자 위치
session:{sessionId}:votes                -- 투표 데이터
session:{sessionId}:vote_count:{placeId} -- 장소별 투표 수
```

### 2. 쿼리 패턴

**빈번한 쿼리**:
1. 세션 정보 조회 → Redis 우선, DB fallback
2. 참가자 목록 → Redis 우선
3. 투표 현황 → Redis에서 실시간 집계
4. 장소 목록 → DB 조회 (변경 빈도 낮음)

**배치 작업**:
1. 만료된 세션 삭제 (매 1시간)
2. 비활성 참가자 정리
3. Redis 캐시 재구성

### 3. 확장성 고려사항

**수평 확장**:
- UUID 기반 ID로 분산 환경 대응
- Redis Cluster로 캐시 분산
- PostgreSQL Read Replica 추가 가능

**수직 확장**:
- 인덱스 최적화로 쿼리 성능 개선
- JSONB 컬럼 활용으로 스키마 변경 최소화

---

## 보안 고려사항

### 1. SQL Injection 방지
- Drizzle ORM의 파라미터화된 쿼리 자동 적용
- 사용자 입력 검증 (Zod 스키마)

### 2. 데이터 접근 제어
- 세션 ID 기반 접근 제어
- 참가자 ID 검증

### 3. 개인정보 처리
- 최소 정보 수집 (이름, 위치만)
- 24시간 후 자동 삭제 (TTL)
- 민감 정보 암호화 불필요 (공개 정보만 저장)

---

## 모니터링 쿼리

### 1. 활성 세션 통계
```sql
SELECT
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/3600) as avg_age_hours
FROM sessions
WHERE expires_at > NOW()
GROUP BY status;
```

### 2. 세션별 참가자 수
```sql
SELECT
  s.id,
  s.title,
  COUNT(p.id) as participant_count
FROM sessions s
LEFT JOIN participants p ON s.id = p.session_id
GROUP BY s.id, s.title
ORDER BY participant_count DESC;
```

### 3. 투표율 분석
```sql
SELECT
  s.id,
  COUNT(DISTINCT p.id) as total_participants,
  COUNT(DISTINCT v.participant_id) as voted_participants,
  ROUND(COUNT(DISTINCT v.participant_id)::NUMERIC /
        COUNT(DISTINCT p.id) * 100, 2) as vote_rate
FROM sessions s
LEFT JOIN participants p ON s.id = p.session_id
LEFT JOIN votes v ON s.id = v.session_id
WHERE s.status = 'voting'
GROUP BY s.id;
```

### 4. 인기 장소 TOP 10
```sql
SELECT
  rp.name,
  rp.category,
  COUNT(v.id) as vote_count
FROM recommended_places rp
LEFT JOIN votes v ON rp.id = v.place_id
WHERE rp.created_at > NOW() - INTERVAL '7 days'
GROUP BY rp.id, rp.name, rp.category
ORDER BY vote_count DESC
LIMIT 10;
```

---

## 트러블슈팅

### 문제 1: 투표 실패 (Foreign Key Constraint)

**증상**: "votes violates foreign key constraint"

**원인**:
- 존재하지 않는 `place_id` 사용
- 존재하지 않는 `participant_id` 사용

**해결**:
```sql
-- 참가자 확인
SELECT id FROM participants WHERE session_id = '...' AND id = '...';

-- 장소 확인
SELECT id FROM recommended_places WHERE session_id = '...' AND id = '...';
```

### 문제 2: Redis와 DB 불일치

**증상**: Redis에는 있지만 DB에 없는 데이터

**원인**: DB 저장 실패 시 Redis만 업데이트됨

**해결**:
```typescript
// Redis 캐시 제거 후 DB에서 재로드
await redisSessionManager.deleteSession(sessionId);
const session = await sessionService.getSession(sessionId); // DB에서 로드
```

### 문제 3: 만료된 세션 정리

**자동 정리**:
```sql
-- 만료된 세션 삭제 (CASCADE로 관련 데이터 자동 삭제)
DELETE FROM sessions WHERE expires_at < NOW();
```

**수동 정리**:
```bash
# PostgreSQL
docker exec meethere-postgres psql -U meethere -d meethere \
  -c "DELETE FROM sessions WHERE expires_at < NOW();"

# Redis
redis-cli --scan --pattern "session:*" | xargs redis-cli del
```

---

## 부록

### A. DDL 전체 스크립트

```sql
-- sessions 테이블
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  host_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  center_lat TEXT,
  center_lng TEXT,
  center_display_name TEXT,
  selected_place_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  completed_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
CREATE INDEX sessions_status_idx ON sessions(status, created_at);

-- participants 테이블
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  name TEXT NOT NULL,
  location_lat TEXT NOT NULL,
  location_lng TEXT NOT NULL,
  location_display_name TEXT,
  joined_at TIMESTAMP NOT NULL DEFAULT now(),
  last_active_at TIMESTAMP NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX participants_session_idx ON participants(session_id);

-- recommended_places 테이블
CREATE TABLE recommended_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  address TEXT NOT NULL,
  road_address TEXT,
  lat TEXT NOT NULL,
  lng TEXT NOT NULL,
  distance INTEGER NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE (session_id, external_id)
);

CREATE INDEX places_session_idx ON recommended_places(session_id);
CREATE UNIQUE INDEX places_session_external_idx
  ON recommended_places(session_id, external_id);

-- votes 테이블
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  participant_id UUID NOT NULL,
  place_id UUID NOT NULL,
  voted_at TIMESTAMP NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  FOREIGN KEY (place_id) REFERENCES recommended_places(id) ON DELETE CASCADE,
  UNIQUE (session_id, participant_id)
);

CREATE UNIQUE INDEX votes_participant_unique_idx
  ON votes(session_id, participant_id);
CREATE INDEX votes_session_place_idx ON votes(session_id, place_id);
```

### B. 샘플 데이터

```sql
-- 테스트 세션
INSERT INTO sessions (id, title, host_name, status, expires_at)
VALUES (
  '5d580ea7-431a-47e7-a60d-52c995ceb619',
  'Team Lunch',
  'Alice',
  'active',
  NOW() + INTERVAL '24 hours'
);

-- 테스트 참가자
INSERT INTO participants (id, session_id, name, location_lat, location_lng)
VALUES
  (
    '8b611c3d-092f-4aaf-b3b8-d388ff5f499a',
    '5d580ea7-431a-47e7-a60d-52c995ceb619',
    'Alice',
    '37.5665',
    '126.9780'
  ),
  (
    'cbf7f396-4025-4feb-b208-bcab2ff9de03',
    '5d580ea7-431a-47e7-a60d-52c995ceb619',
    'Bob',
    '37.5700',
    '126.9850'
  );

-- 테스트 장소
INSERT INTO recommended_places
  (id, session_id, external_id, name, category, address, lat, lng, distance)
VALUES
  (
    'a1111111-1111-1111-1111-111111111111',
    '5d580ea7-431a-47e7-a60d-52c995ceb619',
    'place_a',
    'Test Cafe A',
    'CAFE',
    'Seoul Myeongdong',
    '37.5636',
    '126.9835',
    500
  ),
  (
    'b2222222-2222-2222-2222-222222222222',
    '5d580ea7-431a-47e7-a60d-52c995ceb619',
    'place_b',
    'Test Cafe B',
    'CAFE',
    'Seoul Euljiro',
    '37.5659',
    '126.9910',
    800
  );

-- 테스트 투표
INSERT INTO votes (session_id, participant_id, place_id)
VALUES (
  '5d580ea7-431a-47e7-a60d-52c995ceb619',
  '8b611c3d-092f-4aaf-b3b8-d388ff5f499a',
  'a1111111-1111-1111-1111-111111111111'
);
```

---

## 변경 이력

| 날짜 | 버전 | 변경 내용 | 작성자 |
|------|------|----------|--------|
| 2025-11-07 | 1.0.0 | 초기 스키마 문서 작성 | Claude |

---

**문서 작성일**: 2025-11-07
**마지막 업데이트**: 2025-11-07
**작성자**: Backend Agent (Claude Code)
