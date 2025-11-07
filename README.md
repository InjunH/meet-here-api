# 🗺️ MeetHere API Server (여기서봐)

> 여러 사람의 위치를 기반으로 최적의 만남 장소를 찾아주는 실시간 협업 플랫폼

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.18-lightgrey)](https://expressjs.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8-black)](https://socket.io/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](./LICENSE)

## 📖 목차

- [프로젝트 소개](#-프로젝트-소개)
- [주요 기능](#-주요-기능)
- [기술 스택](#-기술-스택)
- [시작하기](#-시작하기)
- [API 문서](#-api-문서)
- [실시간 통신](#-실시간-통신)
- [프로젝트 구조](#-프로젝트-구조)
- [개발 가이드](#-개발-가이드)
- [테스트](#-테스트)
- [배포](#-배포)
- [기여하기](#-기여하기)

## 🎯 프로젝트 소개

**MeetHere**는 여러 사람이 만날 때 각자의 위치를 고려하여 최적의 중간 지점과 주변 장소를 추천해주는 웹 애플리케이션의 백엔드 API 서버입니다.

### 해결하는 문제

- ❌ 여러 명이 만날 때 위치를 일일이 검색하고 비교하는 번거로움
- ❌ 모두에게 공평한 거리를 찾기 어려운 문제
- ❌ 실시간으로 의견을 조율하기 어려운 상황

### 제공하는 솔루션

- ✅ 참가자들의 위치를 자동으로 계산하여 최적의 중간 지점 제공
- ✅ 중간 지점 주변의 카페, 음식점 등 실제 장소 추천
- ✅ 실시간 투표 시스템으로 간편한 의사결정
- ✅ Socket.io 기반 실시간 동기화로 원활한 협업

## ✨ 주요 기능

### 1. 🎯 중간 지점 계산
- 여러 참가자의 위치 좌표를 기반으로 최적의 중간 지점 산출
- 가중 평균 알고리즘을 사용한 정확한 위치 계산
- 역지오코딩을 통한 실제 주소 및 지역명 제공

### 2. 📍 장소 검색 및 추천
- **카카오 로컬 API**: 주변 카페, 음식점, 스터디카페 등 장소 검색
- **네이버 검색 API**: 추가적인 장소 정보 및 리뷰 데이터
- 카테고리별 필터링 (카페, 음식점, 술집, 스터디룸 등)
- 거리 기반 정렬 및 추천

### 3. 🔄 실시간 협업 시스템
- **Socket.io 기반 실시간 통신**
  - 참가자 실시간 참여/퇴장 알림
  - 위치 정보 실시간 업데이트
  - 투표 현황 실시간 동기화
- **세션 기반 그룹 관리**
  - 고유 세션 ID로 그룹 구분
  - 참가자 관리 및 권한 제어
  - 세션 상태 실시간 모니터링

### 4. 🗳️ 투표 시스템
- 장소에 대한 찬성/반대 투표
- 실시간 투표 결과 집계
- 참가자별 투표 현황 추적

### 5. 🏪 Redis 캐싱
- 세션 데이터 캐싱으로 빠른 응답 속도
- API 응답 캐싱으로 외부 API 호출 최소화
- Redis Adapter를 통한 Socket.io 수평 확장 지원

## 🛠️ 기술 스택

### Core Framework
- **Node.js** (v20+) - JavaScript 런타임
- **Express.js** (v4.18) - 웹 프레임워크
- **TypeScript** (v5.3) - 타입 안정성

### 실시간 통신
- **Socket.io** (v4.8) - 실시간 양방향 통신
- **@socket.io/redis-adapter** - 분산 환경 지원

### 데이터베이스
- **PostgreSQL** - 관계형 데이터베이스 (Production)
- **Drizzle ORM** - 타입 안전한 ORM
- **AWS DynamoDB** - NoSQL 데이터베이스 (Alternative)
- **Redis** - 캐싱 및 세션 관리

### 외부 API
- **Kakao Maps API** - 지도 및 장소 검색
- **Naver Geocoding API** - 역지오코딩 서비스
- **Naver Local Search API** - 장소 검색 및 정보

### 보안 & 미들웨어
- **Helmet** - HTTP 보안 헤더
- **CORS** - 교차 출처 리소스 공유
- **Express Rate Limit** - API 요청 제한
- **Express Validator** - 요청 데이터 검증
- **Zod** - 스키마 검증

### 개발 도구
- **ESLint** - 코드 린팅
- **Jest** - 테스트 프레임워크
- **Supertest** - API 테스트
- **Winston** - 로깅
- **Morgan** - HTTP 요청 로깅
- **tsx** - TypeScript 실행 및 Hot Reload
- **Swagger** - API 문서 자동 생성

## 🚀 시작하기

### 필수 요구사항

- **Node.js** >= 20.0.0
- **PostgreSQL** >= 14 (또는 AWS DynamoDB)
- **Redis** >= 6.0 (선택사항)
- **Kakao API Key** (카카오 개발자 센터)
- **Naver API Keys** (네이버 클라우드 플랫폼 + 네이버 개발자 센터)

### 설치

1. **저장소 클론**
```bash
git clone https://github.com/your-org/meet-here-api.git
cd meet-here-api
```

2. **의존성 설치**
```bash
npm install
```

3. **환경 변수 설정**
```bash
cp .env.example .env
```

`.env` 파일을 열어 필요한 값들을 설정합니다:

```bash
# 서버 설정
NODE_ENV=development
PORT=8080

# 데이터베이스
DATABASE_URL=postgresql://username:password@localhost:5432/meethere

# Redis (선택사항)
REDIS_URL=redis://localhost:6379

# Kakao API
KAKAO_API_KEY=your_kakao_rest_api_key
KAKAO_ADMIN_KEY=your_kakao_admin_key

# Naver Cloud Platform (역지오코딩)
NAVER_CLIENT_ID=your_naver_cloud_client_id
NAVER_CLIENT_SECRET=your_naver_cloud_secret

# Naver 개발자센터 (장소 검색)
NAVER_SEARCH_CLIENT_ID=your_naver_dev_client_id
NAVER_SEARCH_CLIENT_SECRET=your_naver_dev_secret

# JWT 인증
JWT_SECRET=your_super_secret_jwt_key_min_32_characters

# CORS
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

4. **데이터베이스 설정**

PostgreSQL 사용 시:
```bash
# 데이터베이스 생성
createdb meethere

# 마이그레이션 실행
npm run db:migrate
```

또는 개발 환경에서 빠른 스키마 동기화:
```bash
npm run db:push
```

5. **서버 실행**

개발 모드 (Hot Reload):
```bash
npm run dev
```

프로덕션 빌드 및 실행:
```bash
npm run build
npm start
```

6. **서버 확인**

브라우저에서 아래 URL을 열어 서버 상태를 확인합니다:
- **Health Check**: http://localhost:8080/health
- **API 문서**: http://localhost:8080/api-docs

## 📚 API 문서

### Swagger 문서

개발 환경에서 자동으로 생성되는 Swagger UI를 통해 모든 API 엔드포인트를 확인할 수 있습니다:

🔗 **http://localhost:8080/api-docs**

### 주요 API 엔드포인트

#### 세션 관리
```http
POST   /api/v1/sessions          # 새 세션 생성
GET    /api/v1/sessions/:id      # 세션 정보 조회
PUT    /api/v1/sessions/:id      # 세션 정보 업데이트
DELETE /api/v1/sessions/:id      # 세션 삭제
```

#### 참가자 관리
```http
POST   /api/v1/participants           # 참가자 추가
GET    /api/v1/participants/:id       # 참가자 정보 조회
PUT    /api/v1/participants/:id       # 참가자 정보 업데이트
DELETE /api/v1/participants/:id       # 참가자 제거
```

#### 중간 지점 계산
```http
POST   /api/v1/meeting-point/calculate    # 중간 지점 계산
GET    /api/v1/meeting-point/:sessionId   # 세션의 중간 지점 조회
```

#### 장소 검색
```http
GET    /api/v1/places/search          # 장소 검색
GET    /api/v1/places/:id             # 장소 상세 정보
GET    /api/v1/naver/nearby-places    # 네이버 API 장소 검색
```

#### 투표
```http
POST   /api/v1/votes                  # 투표 생성
GET    /api/v1/votes/:sessionId       # 세션의 투표 현황
PUT    /api/v1/votes/:id              # 투표 변경
DELETE /api/v1/votes/:id              # 투표 취소
```

### Postman 컬렉션

Postman으로 API를 테스트하려면 제공된 컬렉션을 import 하세요:

📁 [MeetHere-API.postman_collection.json](./MeetHere-API.postman_collection.json)

## 🔄 실시간 통신

### Socket.io 네임스페이스

MeetHere는 `/meetings` 네임스페이스를 사용합니다.

### 클라이언트 연결

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8080/meetings', {
  transports: ['websocket'],
  autoConnect: true
});

// 세션 참여
socket.emit('join-session', {
  sessionId: 'session-uuid',
  participantId: 'participant-uuid'
});
```

### 주요 이벤트

#### 클라이언트 → 서버 (Emit)
```javascript
// 세션 참여
socket.emit('join-session', { sessionId, participantId });

// 세션 퇴장
socket.emit('leave-session', { sessionId, participantId });

// 위치 업데이트
socket.emit('update-location', { sessionId, participantId, location });

// 투표
socket.emit('vote', { sessionId, participantId, placeId, voteType });
```

#### 서버 → 클라이언트 (Listen)
```javascript
// 참가자 참여 알림
socket.on('participant-joined', (data) => {
  console.log('New participant:', data.participant);
});

// 참가자 퇴장 알림
socket.on('participant-left', (data) => {
  console.log('Participant left:', data.participantId);
});

// 위치 업데이트 알림
socket.on('location-updated', (data) => {
  console.log('Location updated:', data.participant);
});

// 투표 업데이트 알림
socket.on('vote-updated', (data) => {
  console.log('Vote status:', data.votes);
});

// 에러 처리
socket.on('error', (error) => {
  console.error('Socket error:', error);
});
```

### 실시간 테스트

브라우저에서 Socket.io 연결을 테스트하려면:

📁 [test-socket-client.html](./test-socket-client.html) 파일을 브라우저에서 열어주세요.

## 📁 프로젝트 구조

```
meet-here-api/
├── src/
│   ├── config/              # 설정 파일
│   │   ├── index.ts         # 환경 변수 관리
│   │   ├── schema.ts        # 환경 변수 검증 스키마
│   │   └── swagger.ts       # Swagger 설정
│   ├── db/                  # 데이터베이스
│   │   ├── schema/          # Drizzle 스키마
│   │   └── migrate.ts       # 마이그레이션 스크립트
│   ├── middleware/          # Express 미들웨어
│   │   ├── errorHandler.ts # 전역 에러 핸들러
│   │   ├── rateLimiter.ts  # Rate limiting
│   │   ├── requestLogger.ts # 요청 로깅
│   │   └── security.ts      # 보안 헤더
│   ├── repositories/        # 데이터 액세스 레이어
│   │   ├── base.repository.ts
│   │   ├── meeting-point.repository.ts
│   │   ├── naver-api.repository.ts
│   │   └── subway-station.repository.ts
│   ├── routes/              # API 라우터
│   │   ├── health.ts        # 헬스체크
│   │   ├── sessions.ts      # 세션 관리
│   │   ├── participants.ts  # 참가자 관리
│   │   ├── meeting-point.ts # 중간 지점 계산
│   │   ├── places.ts        # 장소 검색
│   │   ├── votes.ts         # 투표
│   │   ├── kakao.ts         # 카카오 API
│   │   └── naver.ts         # 네이버 API
│   ├── schemas/             # Zod 검증 스키마
│   │   └── meeting-point.schemas.ts
│   ├── services/            # 비즈니스 로직
│   │   ├── meeting.service.ts
│   │   ├── place.service.ts
│   │   └── voting.service.ts
│   ├── socket/              # Socket.io 설정
│   │   ├── index.ts         # Socket 서버 설정
│   │   ├── emitter.ts       # 이벤트 발생기
│   │   └── handlers/        # 이벤트 핸들러
│   │       └── meetingHandler.ts
│   ├── types/               # TypeScript 타입 정의
│   │   └── subway.ts
│   ├── utils/               # 유틸리티 함수
│   │   ├── logger.ts        # Winston 로거
│   │   ├── redis.ts         # Redis 클라이언트
│   │   ├── redis-helper.ts  # Redis 헬퍼
│   │   ├── validation.ts    # 검증 유틸
│   │   └── naver-api-validator.ts
│   └── app.ts               # Express 앱 설정
├── tests/                   # 테스트 파일
│   ├── unit/                # 단위 테스트
│   ├── integration/         # 통합 테스트
│   └── e2e/                 # E2E 테스트
├── docs/                    # 상세 문서
│   ├── API_BEST_PRACTICES.md
│   ├── ERROR_HANDLING_GUIDE.md
│   ├── GEOCODING_API_GUIDE.md
│   ├── REPOSITORY_ARCHITECTURE.md
│   └── naver-api-integration.md
├── drizzle/                 # 데이터베이스 마이그레이션
├── logs/                    # 로그 파일
├── dist/                    # 빌드 결과물
├── .env.example             # 환경 변수 예제
├── docker-compose.yml       # Docker 설정
├── drizzle.config.ts        # Drizzle 설정
├── tsconfig.json            # TypeScript 설정
├── jest.config.js           # Jest 설정
└── package.json             # 프로젝트 메타데이터
```

## 🔧 개발 가이드

### 코드 스타일

프로젝트는 ESLint와 Prettier를 사용하여 일관된 코드 스타일을 유지합니다.

```bash
# 린트 검사
npm run lint

# 자동 수정
npm run lint:fix
```

### 데이터베이스 작업

#### 스키마 변경
1. `src/db/schema/`에서 스키마 파일 수정
2. 마이그레이션 파일 생성
```bash
npm run db:generate
```
3. 마이그레이션 적용
```bash
npm run db:migrate
```

#### Drizzle Studio
데이터베이스를 GUI로 확인하고 편집:
```bash
npm run db:studio
```

### 로깅

Winston을 사용한 구조화된 로깅:

```typescript
import { logger } from '@/utils/logger';

logger.info('작업 시작', { userId: '123' });
logger.warn('경고 메시지', { details: '...' });
logger.error('에러 발생', { error: err });
```

로그 레벨: `error` > `warn` > `info` > `http` > `debug`

### 에러 처리

통일된 에러 응답 형식:

```typescript
throw new Error('USER_NOT_FOUND'); // 자동으로 400/404/500 등으로 변환
```

상세한 가이드: [docs/ERROR_HANDLING_GUIDE.md](./docs/ERROR_HANDLING_GUIDE.md)

### API 모범 사례

RESTful API 설계 가이드: [docs/API_BEST_PRACTICES.md](./docs/API_BEST_PRACTICES.md)

## 🧪 테스트

### 테스트 실행

```bash
# 전체 테스트
npm test

# 변경 감지 모드
npm run test:watch

# 커버리지 리포트
npm run test:coverage
```

### 테스트 구조

- **Unit Tests**: 개별 함수 및 메서드 테스트
- **Integration Tests**: API 엔드포인트 통합 테스트
- **E2E Tests**: 전체 워크플로우 테스트

### API 테스트 예제

```typescript
import request from 'supertest';
import app from '@/app';

describe('POST /api/v1/sessions', () => {
  it('should create a new session', async () => {
    const response = await request(app)
      .post('/api/v1/sessions')
      .send({ name: 'Team Meeting' })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('sessionId');
  });
});
```

## 🐳 배포

### Docker 사용

```bash
# 개발 환경 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f api

# 종료
docker-compose down
```

### 프로덕션 배포 체크리스트

- [ ] `NODE_ENV=production` 설정
- [ ] 데이터베이스 마이그레이션 실행
- [ ] 환경 변수 보안 확인 (JWT_SECRET 등)
- [ ] Redis 연결 설정 (수평 확장 시 필수)
- [ ] CORS 설정 검증
- [ ] Rate Limiting 활성화
- [ ] SSL/TLS 인증서 설정
- [ ] 로그 레벨 조정 (`LOG_LEVEL=info`)
- [ ] 헬스체크 엔드포인트 확인

### 환경별 설정

```bash
# 개발
NODE_ENV=development npm run dev

# 스테이징
NODE_ENV=staging npm start

# 프로덕션
NODE_ENV=production npm start
```

## 📖 추가 문서

프로젝트의 상세한 기술 문서는 [docs/](./docs/) 디렉토리에서 확인하세요:

- [API 설계 모범 사례](./docs/API_BEST_PRACTICES.md)
- [에러 처리 가이드](./docs/ERROR_HANDLING_GUIDE.md)
- [지오코딩 API 가이드](./docs/GEOCODING_API_GUIDE.md)
- [Repository 아키텍처](./docs/REPOSITORY_ARCHITECTURE.md)
- [네이버 API 통합](./docs/naver-api-integration.md)
- [주변 장소 검색 구현](./NEARBY_PLACES_IMPLEMENTATION.md)
- [실시간 다중 사용자 기능](./MeetHere%20실시간%20다중%20사용자%20약속%20잡기%20기능%20구현%20계획.md)

## 🤝 기여하기

프로젝트에 기여하고 싶으시다면:

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### 커밋 메시지 컨벤션

```
feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 수정
style: 코드 포맷팅
refactor: 코드 리팩토링
test: 테스트 추가/수정
chore: 빌드/설정 변경
```

## 📄 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다. 자세한 내용은 [LICENSE](./LICENSE) 파일을 참조하세요.

## 👥 팀

**MeetHere Team**

- Backend Developer: Express.js, Socket.io, PostgreSQL
- DevOps: AWS, Docker, Redis
- API Integration: Kakao Maps, Naver APIs

## 🙏 감사의 말

이 프로젝트는 다음 기술과 서비스를 활용합니다:

- [Express.js](https://expressjs.com/)
- [Socket.io](https://socket.io/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Kakao Developers](https://developers.kakao.com/)
- [Naver Cloud Platform](https://www.ncloud.com/)
- [Naver Developers](https://developers.naver.com/)

## 📞 문의

프로젝트 관련 문의사항이 있으시면 이슈를 등록해주세요.

---

**Made with ❤️ by MeetHere Team**
