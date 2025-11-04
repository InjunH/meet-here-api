# 네이버 주변 장소 검색 API 구현 보고서

## 구현 완료 사항

### 엔드포인트
- **경로**: `POST /api/v1/naver/nearby-places`
- **파일**: `/Users/hwang-injun-gaeinjag-eob/development/side-project/meet_here/meet_here_api/src/routes/naver.ts`
- **라인**: 785-966

## 주요 기능

### 1. 요청 검증 (Zod 스키마)
```typescript
const nearbyPlacesRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  query: z.string().min(1, "검색 카테고리는 필수입니다").max(100),
  start: z.number().min(1).max(1000).optional().default(1),
  display: z.number().min(1).max(5).optional().default(5),
});
```

### 2. 검색 로직 (3단계)

#### 1단계: Reverse Geocoding
- 입력 좌표 (lat, lng)를 주소로 변환
- 네이버 클라우드 플랫폼 Reverse Geocoding API 사용
- area3 (동/읍/면) 우선, 없으면 area2 (구/군) 추출
- 실패 시에도 계속 진행 (Graceful Degradation)

```typescript
const coords = `${lng},${lat}`;
const reverseGeocodeResponse = await naverCloudClient.reverseGeocode(coords, {
  sourceCrs: "epsg:4326",
  orders: "addr",
  output: "json",
});

const addrResult = geocodeData.results.find((r) => r.name === "addr");
if (addrResult) {
  areaName = addrResult.region.area3?.name || addrResult.region.area2?.name || "";
}
```

#### 2단계: 검색 쿼리 구성
- 지역명이 있는 경우: `"지역명 + 카테고리"` (예: "역삼동 카페")
- 지역명이 없는 경우: `"카테고리"` (예: "카페")

```typescript
const searchQuery = areaName ? `${areaName} ${query}` : query;
```

#### 3단계: Local Search API 호출
- 네이버 개발자센터 Local Search API 사용
- 기존 `naverSearchService.searchLocal()` 메서드 활용
- HTML 태그 자동 제거 및 좌표 변환 처리

```typescript
const searchResults = await naverSearchService.searchLocal(searchQuery, {
  display,
  start,
  sort: "random",
});
```

### 3. 응답 데이터 구성
```typescript
const places = searchResults.map((item) => ({
  title: item.title,          // HTML 태그 제거됨
  address: item.address,      // 지번 주소
  roadAddress: item.roadAddress,  // 도로명 주소
  category: item.category,    // 카테고리
  mapx: item.coordinates.lng, // 경도 (WGS84)
  mapy: item.coordinates.lat, // 위도 (WGS84)
}));
```

### 4. 페이지네이션
```typescript
const totalCount = places.length > 0 ? 100 : 0;
const hasMore = places.length === display && start + display <= 1000;
```

### 5. 에러 처리

#### 검증 에러 (400 Bad Request)
- 좌표 범위 오류 (lat: -90~90, lng: -180~180)
- 필수 파라미터 누락 (query)
- 파라미터 타입 오류

#### 설정 에러 (500 Internal Server Error)
- 네이버 API 인증 정보 미설정
- 환경변수 누락

#### API 호출 에러
- 네이버 Search API 호출 실패
- 네트워크 오류
- AppError를 통한 구조화된 에러 핸들링

## 기술적 특징

### 1. Graceful Degradation
- Reverse Geocoding 실패 시에도 카테고리 검색 계속 진행
- 부분적 실패가 전체 요청을 중단시키지 않음

### 2. 기존 인프라 활용
- `naverSearchService`: 이미 구현된 서비스 재사용
- `naverCloudClient`: 기존 HTTP 클라이언트 활용
- HTML 태그 제거 및 좌표 변환 로직 재사용

### 3. 로깅 및 모니터링
```typescript
logger.info("주변 장소 검색 요청", {
  requestId,
  lat, lng, query, start, display,
  userAgent: req.headers["user-agent"],
});

logger.info("Reverse Geocoding 결과", {
  requestId, areaName, hasArea: !!areaName,
});

logger.info("주변 장소 검색 성공", {
  requestId, resultCount: searchResults.length, searchQuery,
});
```

### 4. Swagger 문서화
- OpenAPI 스펙 완전 준수
- 요청/응답 스키마 정의
- 예시 데이터 포함

## 환경 변수

### 필수 환경 변수
```bash
# 네이버 개발자센터 API (Local Search)
NAVER_SEARCH_CLIENT_ID=your_naver_search_client_id
NAVER_SEARCH_CLIENT_SECRET=your_naver_search_client_secret

# 네이버 클라우드 플랫폼 API (Reverse Geocoding)
NAVER_CLIENT_ID=your_naver_cloud_client_id
NAVER_CLIENT_SECRET=your_naver_cloud_client_secret
```

## 테스트 방법

### 1. 서버 실행
```bash
cd meet_here_api
npm run dev
```

### 2. curl 테스트
```bash
# 간단 테스트
./test-nearby-curl.sh

# 전체 테스트 (성공/실패 케이스)
./test-nearby-places.sh
```

### 3. 수동 테스트 예시
```bash
curl -X POST http://localhost:8080/api/v1/naver/nearby-places \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 37.498095,
    "lng": 127.027619,
    "query": "카페",
    "display": 5
  }'
```

## 제한 사항 및 개선 방향

### 현재 제한 사항
1. **좌표 기반 직접 거리 검색 불가**: 네이버 Local Search API는 키워드 검색만 지원
2. **총 결과 수 부정확**: 네이버 API가 정확한 총 개수를 제공하지 않음
3. **페이지네이션 한계**: 최대 1000건까지만 조회 가능
4. **검색 결과 개수 제한**: 한 번에 최대 5개까지만 조회 가능

### 개선 방향
1. **거리 기반 필터링**:
   - 응답 데이터에서 중간지점과의 거리 계산
   - 거리순 정렬 옵션 추가

2. **캐싱 전략**:
   - 동일 좌표/카테고리 검색 결과 캐싱
   - Redis를 활용한 분산 캐시

3. **검색 쿼리 최적화**:
   - 지역명 추출 로직 개선
   - 검색 정확도 향상을 위한 쿼리 튜닝

4. **에러 복구 전략**:
   - Reverse Geocoding 실패 시 대체 API 사용
   - 재시도 로직 강화

## 파일 구조

```
meet_here_api/
├── src/
│   ├── routes/
│   │   └── naver.ts                    # 엔드포인트 구현 (nearby-places 추가)
│   ├── services/
│   │   └── naver-search.service.ts     # 기존 서비스 활용
│   └── lib/
│       └── api-clients.ts              # 네이버 API 클라이언트
├── docs/
│   └── api-nearby-places.md            # API 가이드 문서
├── test-nearby-places.sh               # 전체 테스트 스크립트
├── test-nearby-curl.sh                 # 간단 테스트 스크립트
└── NEARBY_PLACES_IMPLEMENTATION.md     # 이 문서
```

## 결론

네이버 지역 검색 API 연동 엔드포인트가 성공적으로 구현되었습니다.

**구현 완료**:
- Zod 스키마 검증
- Reverse Geocoding 통합
- Local Search API 연동
- 에러 처리 및 로깅
- Swagger 문서화
- 테스트 스크립트

**주요 특징**:
- Graceful Degradation으로 안정성 확보
- 기존 인프라 재사용으로 일관성 유지
- 구조화된 에러 핸들링
- 상세한 로깅 및 모니터링

**테스트 준비 완료**:
- curl 테스트 스크립트
- 성공/실패 케이스 검증
- API 가이드 문서
