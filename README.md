# MeetHere API Server

**여기서봐** 서비스의 백엔드 API 서버입니다. Express.js + TypeScript로 구축되었으며, 위치 기반 만남 장소 추천 서비스를 제공합니다.

## 🚀 Quick Start

### Prerequisites

- Node.js 20.0.0 이상
- PostgreSQL (개발용)
- Redis (선택사항, 캐싱용)
- Kakao Developers API Key

### Installation

```bash
# Dependencies 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일을 편집하여 필요한 값들을 설정하세요

# 데이터베이스 설정 (PostgreSQL 사용시)
npm run db:push

# 개발 서버 시작
npm run dev
```

## 📁 Project Structure

```
src/
├── routes/          # API 라우트 정의
│   ├── health.ts    # 헬스체크 엔드포인트
│   ├── meetings.ts  # 미팅 관리 API
│   ├── places.ts    # 장소 검색 API
│   ├── votings.ts   # 투표 시스템 API
│   └── kakao.ts     # Kakao API 프록시
├── middleware/      # Express 미들웨어
│   ├── errorHandler.ts
│   ├── rateLimiter.ts
│   ├── security.ts
│   └── requestLogger.ts
├── utils/          # 유틸리티 함수들
│   ├── logger.ts
│   ├── redis.ts
│   └── validation.ts
├── db/             # 데이터베이스 연결 및 설정
└── app.ts          # Express 앱 설정
```

## 🔧 Available Scripts

```bash
# 개발 서버 (HMR 지원)
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 서버 실행
npm start

# 코드 린팅
npm run lint
npm run lint:fix

# 테스트 실행
npm test
npm run test:watch
npm run test:coverage

# 데이터베이스 작업
npm run db:generate  # 마이그레이션 생성
npm run db:migrate   # 마이그레이션 실행
npm run db:push      # 스키마 직접 푸시
npm run db:studio    # Drizzle Studio 실행
```

## 🌐 API Endpoints

### Health Check
- `GET /health` - 전체 헬스체크
- `GET /health/live` - 생존 확인
- `GET /health/ready` - 준비 상태 확인

### Meetings API
- `POST /api/v1/meetings` - 새 미팅 생성
- `GET /api/v1/meetings/:id` - 미팅 조회
- `GET /api/v1/meetings/code/:code` - 코드로 미팅 조회

### Places API
- `GET /api/v1/places/search` - 장소 검색
- `GET /api/v1/places/:id` - 장소 상세 조회
- `GET /api/v1/places/categories` - 카테고리 목록

### Voting API
- `POST /api/v1/votings` - 투표 생성
- `GET /api/v1/votings/:id` - 투표 조회
- `POST /api/v1/votings/:id/vote` - 투표 참여
- `GET /api/v1/votings/:id/results` - 투표 결과 조회

### Kakao API Proxy
- `GET /api/v1/kakao/search/address` - 주소 검색
- `GET /api/v1/kakao/search/keyword` - 키워드 장소 검색
- `GET /api/v1/kakao/coord2address` - 좌표→주소 변환

## 🔐 Environment Variables

```bash
# 기본 설정
NODE_ENV=development
PORT=8080

# 데이터베이스
DATABASE_URL=postgresql://username:password@localhost:5432/meethere

# Redis (선택사항)
REDIS_URL=redis://localhost:6379
ENABLE_REDIS_CACHE=true

# Kakao API
KAKAO_API_KEY=your_kakao_rest_api_key

# 보안
JWT_SECRET=your_super_secret_jwt_key

# CORS
CORS_ORIGIN=http://localhost:5173,http://localhost:3000

# 기능 플래그
ENABLE_RATE_LIMITING=true
ENABLE_REQUEST_LOGGING=true
```

## 🏗️ Architecture

### Development Stack
- **Runtime**: Node.js 20 + TypeScript 5.3
- **Framework**: Express.js 4.18
- **Database**: PostgreSQL + Drizzle ORM
- **Cache**: Redis (선택사항)
- **Validation**: Zod
- **Testing**: Jest + Supertest
- **Code Quality**: ESLint + TypeScript strict mode

### Production Stack (AWS)
- **Compute**: Lambda Functions
- **API Gateway**: AWS API Gateway
- **Database**: DynamoDB (primary) + ElastiCache Redis
- **External APIs**: Kakao Maps API
- **Monitoring**: CloudWatch + Winston logging

## 🛡️ Security Features

- **Rate Limiting**: IP 기반 요청 제한
- **CORS**: 설정 가능한 출처 제어
- **Security Headers**: Helmet.js 보안 헤더
- **Input Validation**: Zod 스키마 검증
- **Request Logging**: 모든 API 요청 로깅
- **Error Handling**: 구조화된 에러 응답

## 📊 Monitoring

### Logging
- **Winston**: 구조화된 JSON 로깅
- **Request Tracking**: 요청 ID 기반 추적
- **Error Tracking**: 스택 트레이스와 컨텍스트 정보

### Health Checks
- **Liveness Probe**: `/health/live`
- **Readiness Probe**: `/health/ready`
- **Detailed Health**: `/health` (서비스 상태 포함)

## 🧪 Testing

### Test Structure
```bash
tests/
├── unit/           # 유닛 테스트
├── integration/    # 통합 테스트
└── setup.ts        # 테스트 설정
```

### Running Tests
```bash
# 모든 테스트 실행
npm test

# 감시 모드
npm run test:watch

# 커버리지 리포트
npm run test:coverage
```

## 🚀 Deployment

### Development
```bash
# 로컬 개발 서버
npm run dev

# 포트 8080에서 실행됩니다
curl http://localhost:8080/health
```

### Production
```bash
# 빌드
npm run build

# 프로덕션 서버 실행
npm start
```

## 🤝 Integration

### Frontend Integration
- **Client**: `../meet_here_client`에 위치한 React 앱
- **Shared Types**: `../meet_here_client/shared/schema.ts` 공유
- **API Base URL**: 환경에 따라 자동 설정

### External Services
- **Kakao Maps API**: 장소 검색 및 지오코딩
- **PostgreSQL**: 개발 환경 데이터베이스
- **Redis**: 캐싱 및 세션 스토어 (선택사항)

## 📝 API Documentation

상세한 API 문서는 `../docs/` 디렉토리에서 확인할 수 있습니다:
- Technical Requirements Document
- API 스펙 및 예제
- 데이터 모델 정의

## 🐛 Troubleshooting

### 일반적인 문제들

**포트 충돌**
```bash
# 다른 포트로 실행
PORT=8081 npm run dev
```

**데이터베이스 연결 오류**
```bash
# DATABASE_URL 확인
echo $DATABASE_URL

# 데이터베이스 스키마 푸시
npm run db:push
```

**Kakao API 오류**
```bash
# API 키 확인
echo $KAKAO_API_KEY

# API 키가 Kakao Developers에서 활성화되어 있는지 확인
```

### 로그 확인
```bash
# 로그 파일 확인
tail -f logs/app.log

# 에러 로그만 확인
tail -f logs/app-error.log
```

## 📚 Additional Resources

- [Express.js Documentation](https://expressjs.com/)
- [Drizzle ORM Guide](https://orm.drizzle.team/)
- [Kakao Developers](https://developers.kakao.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**개발 환경이 준비되었습니다! 🎉**

`npm run dev`로 개발 서버를 시작하고 http://localhost:8080/health에서 상태를 확인하세요.