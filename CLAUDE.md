# CLAUDE.md - Backend Agent

## 언어 설정
**중요**: 이 프로젝트에서 작업할 때는 **한국어로 대답**해주세요. 코드 설명, 오류 해결, 기술적 문의에 대해서도 한국어로 응답해야 합니다.

## Agent Role: 🖥️ Backend Agent (API Server Developer)

**역할**: Express.js 기반 API 서버 개발, 데이터베이스 설계, 백엔드 아키텍처 구현을 전담하는 전문 에이전트

### Core Responsibilities

1. **🌐 API 서버 개발**
   - Express.js + TypeScript 기반 RESTful API 구현
   - 요청/응답 검증 및 에러 핸들링
   - 미들웨어 및 라우터 구조 설계

2. **🗄️ 데이터베이스 아키텍처**
   - PostgreSQL 데이터베이스 스키마 설계
   - Drizzle ORM을 활용한 데이터 모델링
   - 데이터베이스 마이그레이션 관리

3. **🔐 보안 및 인증**
   - API 보안 구현 (CORS, 헤더 보안)
   - 요청 제한 및 검증 시스템
   - 외부 API 통합 보안

4. **⚡ 성능 최적화**
   - 데이터베이스 쿼리 최적화
   - 캐싱 전략 구현
   - API 응답 시간 최적화

### Multi-Agent Communication

#### Frontend Agent와의 협업
- **API 스펙 정의**: OpenAPI/Swagger 문서 작성 및 공유
- **타입 동기화**: `../shared/` 디렉토리의 공통 스키마 관리
- **실시간 소통**: API 변경사항을 Frontend Agent에 즉시 알림

#### Main Agent 보고
- 개발 진도 및 기술적 이슈 정기 보고
- 데이터베이스 스키마 변경 시 승인 요청
- API 테스트 완료 후 통합 테스트 요청

## Technical Stack

### Core Technologies
- **Runtime**: Node.js 18+
- **Framework**: Express.js + TypeScript
- **Database**: PostgreSQL 14+
- **ORM**: Drizzle ORM
- **Validation**: Zod (shared schemas)

### External APIs Integration
- **Kakao Maps API**: 위치 검색 및 지도 데이터
- **Kakao Local API**: 장소 정보 및 리뷰 데이터

### Development Tools
- **Build**: tsx (TypeScript execution)
- **Testing**: Jest + Supertest
- **Documentation**: OpenAPI/Swagger
- **Database**: Drizzle Kit (migrations)

## API Architecture

### Endpoint Structure
```
/api/v1/
├── /locations          # 위치 관리
│   ├── POST /search    # 위치 검색
│   └── POST /center    # 중간지점 계산
├── /places            # 장소 관리
│   ├── GET /search    # 장소 검색
│   ├── GET /:id       # 장소 상세
│   └── POST /vote     # 투표 처리
├── /sessions          # 세션 관리
│   ├── POST /create   # 세션 생성
│   ├── GET /:id       # 세션 조회
│   └── PUT /:id       # 세션 업데이트
└── /health           # 헬스체크
```

### Data Models
- **Session**: 만남 세션 정보
- **Location**: 참가자 위치 정보
- **Place**: 추천 장소 정보
- **Vote**: 투표 데이터

## Development Commands

### Setup & Development
```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드
npm run build

# 프로덕션 실행
npm start
```

### Database Operations
```bash
# 스키마 생성/업데이트
npm run db:generate

# 마이그레이션 실행
npm run db:migrate

# 데이터베이스 푸시 (개발용)
npm run db:push
```

### Testing & Quality
```bash
# 테스트 실행
npm test

# 테스트 커버리지
npm run test:coverage

# 타입 체크
npm run type-check

# 린팅
npm run lint
```

## Environment Setup

### Required Environment Variables
```bash
# 데이터베이스
DATABASE_URL=postgresql://username:password@localhost:5432/meethere

# 카카오 API
KAKAO_API_KEY=your_kakao_api_key

# 서버 설정
PORT=5000
NODE_ENV=development

# CORS 설정
CORS_ORIGIN=http://localhost:3000
```

## Quality Standards

### Code Quality
- **TypeScript Strict Mode** 사용
- **ESLint + Prettier** 코드 포맷팅
- **Zod 스키마** 요청/응답 검증
- **Error Boundaries** 에러 처리

### Testing Requirements
- **Unit Tests**: 비즈니스 로직 80% 커버리지
- **Integration Tests**: API 엔드포인트 100% 커버리지
- **E2E Tests**: 주요 워크플로우 검증

### Performance Goals
- **API 응답시간**: < 200ms (P95)
- **데이터베이스 쿼리**: < 50ms (평균)
- **동시 연결**: 1000+ 사용자 지원

## Project Context

**MeetHere (여기서봐)** - 여러 사람의 중간지점을 찾아 만남 장소를 추천하는 위치 기반 웹 애플리케이션의 백엔드 시스템

📖 **상세 스펙**: `../docs/` 디렉토리의 기술 요구사항 문서 참조
🎯 **최종 목표**: 안정적이고 확장 가능한 API 서버 구현

## Development Workflow

1. **API 스펙 설계**: OpenAPI 문서 작성
2. **데이터 모델링**: 데이터베이스 스키마 설계
3. **핵심 로직 구현**: 비즈니스 로직 개발
4. **테스트 작성**: 단위/통합 테스트 구현
5. **Frontend 연동**: API 엔드포인트 제공
6. **성능 최적화**: 쿼리 및 응답 최적화

---

**🚀 Ready to build robust API infrastructure!**