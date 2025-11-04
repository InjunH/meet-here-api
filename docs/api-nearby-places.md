# 네이버 주변 장소 검색 API 가이드

## 엔드포인트

**POST** `/api/v1/naver/nearby-places`

중간지점 좌표를 기반으로 주변의 카페, 음식점, 스터디카페 등의 장소를 검색합니다.

## 요청 형식

### Headers
```
Content-Type: application/json
```

### Request Body
```json
{
  "lat": 37.498095,        // 중간지점 위도 (필수, -90 ~ 90)
  "lng": 127.027619,       // 중간지점 경도 (필수, -180 ~ 180)
  "query": "카페",         // 검색 카테고리 (필수, 1~100자)
  "start": 1,              // 페이지네이션 시작 위치 (선택, 기본값: 1)
  "display": 5             // 결과 개수 (선택, 1~5, 기본값: 5)
}
```

## 응답 형식

### 성공 응답 (200 OK)
```json
{
  "success": true,
  "data": {
    "places": [
      {
        "title": "스타벅스 강남역점",
        "address": "서울특별시 강남구 역삼동 123-45",
        "roadAddress": "서울특별시 강남구 강남대로 123",
        "category": "음식점>카페,디저트",
        "mapx": 127.027619,  // 경도 (WGS84)
        "mapy": 37.498095    // 위도 (WGS84)
      }
    ],
    "totalCount": 100,       // 전체 결과 수 (추정값)
    "start": 1,              // 현재 시작 위치
    "hasMore": true          // 다음 페이지 존재 여부
  },
  "timestamp": "2025-11-03T12:34:56.789Z"
}
```

### 에러 응답 (400 Bad Request)
```json
{
  "success": false,
  "error": "Bad Request",
  "message": "검색 카테고리는 필수입니다",
  "timestamp": "2025-11-03T12:34:56.789Z"
}
```

### 에러 응답 (500 Internal Server Error)
```json
{
  "success": false,
  "error": "Internal Server Error",
  "message": "장소 검색 중 오류가 발생했습니다",
  "timestamp": "2025-11-03T12:34:56.789Z"
}
```

## 사용 예시

### 예시 1: 강남역 근처 카페 검색
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

### 예시 2: 역삼역 근처 음식점 검색 (페이지네이션)
```bash
curl -X POST http://localhost:8080/api/v1/naver/nearby-places \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 37.5006,
    "lng": 127.0366,
    "query": "음식점",
    "start": 1,
    "display": 3
  }'
```

### 예시 3: 수원시청 근처 스터디카페 검색
```bash
curl -X POST http://localhost:8080/api/v1/naver/nearby-places \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 37.2636,
    "lng": 127.0286,
    "query": "스터디카페"
  }'
```

## 구현 세부사항

### 검색 로직

1. **Reverse Geocoding**: 좌표를 주소로 변환하여 지역명 추출
   - 네이버 클라우드 플랫폼의 Reverse Geocoding API 사용
   - area3 (동/읍/면) 우선, 없으면 area2 (구/군) 사용
   - 실패 시 카테고리만으로 검색 진행

2. **검색 쿼리 구성**: `"지역명 + 카테고리"` 형식
   - 예: "역삼동 카페", "강남구 음식점"
   - Reverse Geocoding 실패 시: "카페", "음식점" (카테고리만)

3. **Local Search API 호출**: 네이버 개발자센터 Local Search API
   - 정확도순 정렬 (sort: "random")
   - HTML 태그 자동 제거
   - 중복 좌표 제거

4. **좌표 변환**: 카텍 좌표계 → WGS84 좌표계
   - 네이버 API는 mapx/mapy를 10^7로 곱한 정수로 반환
   - 응답 시 10^7로 나눠서 실제 좌표로 변환

### 페이지네이션

- **start**: 검색 시작 위치 (1부터 시작, 최대 1000)
- **display**: 한 번에 가져올 결과 개수 (최대 5)
- **hasMore**: `places.length === display && start + display <= 1000`
- **totalCount**: 네이버 API가 정확한 총 개수를 제공하지 않으므로 추정값 사용

### 환경 변수 설정

```bash
# 네이버 개발자센터 API (Local Search)
NAVER_SEARCH_CLIENT_ID=your_naver_search_client_id
NAVER_SEARCH_CLIENT_SECRET=your_naver_search_client_secret

# 네이버 클라우드 플랫폼 API (Reverse Geocoding)
NAVER_CLIENT_ID=your_naver_cloud_client_id
NAVER_CLIENT_SECRET=your_naver_cloud_client_secret
```

## 에러 처리

### 클라이언트 에러 (4xx)
- **400 Bad Request**: 잘못된 파라미터 (좌표 범위, query 누락 등)
  - lat/lng 범위 검증 (-90~90, -180~180)
  - query 필수 검증 및 길이 제한 (1~100자)

### 서버 에러 (5xx)
- **500 Internal Server Error**: 네이버 API 호출 실패, 서버 내부 오류
  - 네이버 Search API 인증 실패
  - 네트워크 오류
  - 예상치 못한 서버 에러

## 제한 사항

1. **네이버 API 할당량**: 무료 플랜 기준 일 25,000건
2. **검색 결과 최대 개수**: display 최대 5개
3. **페이지네이션 한계**: start 최대 1000
4. **좌표 기반 직접 검색 불가**: Reverse Geocoding으로 지역명 먼저 추출 필요
5. **HTML 태그**: 네이버 API는 title에 `<b>`, `</b>` 태그를 포함하므로 자동 제거

## 참고 문서

- [네이버 개발자센터 - Local Search API](https://developers.naver.com/docs/serviceapi/search/local/local.md)
- [네이버 클라우드 플랫폼 - Reverse Geocoding API](https://api.ncloud-docs.com/docs/ai-naver-mapsreversegeocoding-gc)
