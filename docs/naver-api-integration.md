# 네이버 클라우드 플랫폼 Reverse Geocoding API 통합

이 문서는 MeetHere 프로젝트에 구현된 네이버 클라우드 플랫폼 Reverse Geocoding API 통합에 대해 설명합니다.

## 개요

네이버 클라우드 플랫폼의 Maps Reverse Geocoding API를 백엔드 프록시로 구현하여, 프론트엔드에서 CORS 문제 없이 좌표를 한국 주소로 변환할 수 있도록 지원합니다.

## 구현된 기능

### 백엔드 API 엔드포인트

#### 1. 실제 Reverse Geocoding API
```
POST /api/v1/naver/reverse-geocode
```

**요청 본문:**
```json
{
  "lat": 37.3595704,
  "lng": 127.105399
}
```

**응답 예시:**
```json
{
  "success": true,
  "data": {
    "address": "경기도 수원시 영통구 이의동 1304-4",
    "roadAddress": "경기도 수원시 영통구 광교산로 154-42",
    "district": "경기도 수원시 영통구"
  },
  "timestamp": "2025-09-26T06:05:52.628Z"
}
```

#### 2. 테스트용 Reverse Geocoding API
```
POST /api/v1/naver/reverse-geocode-test
```
실제 네이버 API를 호출하지 않고 목업 데이터를 반환합니다.

#### 3. 헬스체크 API
```
GET /api/v1/naver/health
```
네이버 API 서비스 설정 상태를 확인합니다.

#### 4. 상세 진단 API
```
GET /api/v1/naver/diagnose
```
네이버 API 키 유효성을 실제 API 호출로 검증하고 상세한 진단 정보를 제공합니다.

**응답 예시 (정상):**
```json
{
  "success": true,
  "service": "naver-api",
  "status": "valid",
  "message": "네이버 API 키가 정상적으로 작동합니다",
  "timestamp": "2025-09-26T06:30:16.358Z"
}
```

**응답 예시 (401 인증 오류):**
```json
{
  "success": false,
  "service": "naver-api",
  "status": "invalid",
  "error": "CREDENTIALS_INVALID",
  "message": "API 키 인증 실패 (401 Unauthorized)",
  "suggestion": "네이버 클라우드 플랫폼 콘솔에서 API 키를 다시 확인하고 재발급받으세요",
  "setupGuide": "...(상세한 설정 가이드)",
  "fallback": {
    "available": true,
    "endpoint": "/api/v1/naver/reverse-geocode-test",
    "description": "테스트용 Mock 데이터 제공"
  }
}
```

### 프론트엔드 클라이언트

#### 1. API 클라이언트 함수 (`/client/src/utils/naverApi.ts`)

```typescript
import { reverseGeocode } from '@/utils/naverApi';

// 좌표를 주소로 변환
try {
  const result = await reverseGeocode(37.3595704, 127.105399);
  console.log(result.address); // "경기도 수원시 영통구 이의동 1304-4"
} catch (error) {
  console.error('API 오류:', error.message);
}
```

#### 2. React Query 훅 (`/client/src/hooks/useNaverApi.ts`)

```typescript
import { useReverseGeocode } from '@/hooks/useNaverApi';

function LocationComponent() {
  const { data, isLoading, error } = useReverseGeocode(37.3595704, 127.105399);

  if (isLoading) return <div>주소를 찾는 중...</div>;
  if (error) return <div>오류: {error.message}</div>;
  if (data) return <div>{data.address}</div>;

  return null;
}
```

## 환경 설정

### 필수 환경변수

백엔드 `.env` 파일에 다음 설정을 추가:

```bash
# 네이버 클라우드 플랫폼 API 인증
NAVER_CLIENT_ID=kwo7ii30sc
NAVER_CLIENT_SECRET=fvfSE93FH9koZLYeDrjv23vO9MEPR2yHh0TMREZg
```

### 프론트엔드 설정

프론트엔드 `.env` 파일에 백엔드 API URL 설정:

```bash
VITE_API_URL=http://localhost:8080
```

## API 사용법

### 1. 자동 쿼리 (권장)

좌표가 유효할 때 자동으로 주소를 검색:

```typescript
const { data, isLoading, error } = useReverseGeocode(lat, lng, {
  enabled: isValidCoordinates(lat, lng),
  staleTime: 1000 * 60 * 10, // 10분 캐시
});
```

### 2. 수동 뮤테이션

사용자 액션에 의해 수동으로 실행:

```typescript
const mutation = useReverseGeocodeMutation();

const handleSearch = () => {
  mutation.mutate(
    { lat, lng },
    {
      onSuccess: (data) => console.log('성공:', data),
      onError: (error) => console.error('오류:', error)
    }
  );
};
```

### 3. 배치 처리

여러 좌표를 동시에 처리:

```typescript
const coordinates = [
  { lat: 37.3595704, lng: 127.105399 },
  { lat: 37.5665, lng: 126.9780 }
];

const results = useBatchReverseGeocode(coordinates);
```

## 에러 처리

### 향상된 401 인증 오류 처리

네이버 API에서 401 인증 오류가 발생하는 경우, 시스템이 자동으로 다음 단계를 수행합니다:

1. **상세한 진단 정보 제공**: API 키 설정 상태, 가능한 원인 분석
2. **Service Unavailable (503) 반환**: 인증 오류를 서비스 사용 불가로 분류
3. **Fallback 옵션 제공**: 테스트용 Mock 데이터 엔드포인트 안내
4. **설정 가이드 제공**: 개발 환경에서 완전한 설정 가이드 제공

**401 오류 시 응답 예시:**
```json
{
  "success": false,
  "error": "Service Unavailable",
  "message": "네이버 API 인증 오류 (401): API 키 확인 필요\n- Client ID: kwo7ii30sc\n- Client Secret: 설정됨\n- 가능한 원인: 1) API 키가 잘못되었음 2) 네이버 클라우드 플랫폼에서 서비스가 활성화되지 않음 3) 도메인 제한 설정 문제\n- 대안: /api/v1/naver/reverse-geocode-test 엔드포인트 사용 (Mock 데이터)",
  "fallback": {
    "available": true,
    "endpoint": "/api/v1/naver/reverse-geocode-test",
    "description": "테스트용 Mock 데이터 제공"
  }
}
```

### NaverApiError 클래스

```typescript
try {
  const result = await reverseGeocode(lat, lng);
} catch (error) {
  if (error instanceof NaverApiError) {
    console.error('API 오류:', error.message);
    console.error('상태 코드:', error.status);
    console.error('에러 코드:', error.code);

    // Fallback 옵션 사용
    if (error.fallback?.available) {
      console.log('대안 엔드포인트:', error.fallback.endpoint);
      const mockResult = await reverseGeocodeTest(lat, lng);
      return mockResult;
    }
  }
}
```

### 주요 에러 코드

- `CREDENTIALS_MISSING`: API 키가 설정되지 않음
- `CREDENTIALS_INVALID`: API 키 인증 실패 (401)
- `SERVICE_INACTIVE`: 서비스가 활성화되지 않음 (403)
- `NETWORK_ERROR`: 네트워크 연결 오류
- `INVALID_COORDINATES`: 잘못된 좌표 형식
- `NO_ADDRESS_FOUND`: 주소를 찾을 수 없음

## 테스트

### 백엔드 테스트 실행

```bash
cd meet_here_api
npm test -- --testPathPattern=naver.test.ts
```

### 수동 API 테스트

```bash
# 헬스체크
curl -X GET http://localhost:8080/api/v1/naver/health

# 상세 진단 (실제 API 키 유효성 검증)
curl -X GET http://localhost:8080/api/v1/naver/diagnose

# 실제 API (401 오류가 예상됨)
curl -X POST http://localhost:8080/api/v1/naver/reverse-geocode \
  -H "Content-Type: application/json" \
  -d '{"lat": 37.3595704, "lng": 127.105399}'

# 테스트 API (목업 데이터 - 항상 성공)
curl -X POST http://localhost:8080/api/v1/naver/reverse-geocode-test \
  -H "Content-Type: application/json" \
  -d '{"lat": 37.3595704, "lng": 127.105399}'

# 다양한 지역 테스트
curl -X POST http://localhost:8080/api/v1/naver/reverse-geocode-test \
  -H "Content-Type: application/json" \
  -d '{"lat": 37.5665, "lng": 126.9780}'  # 서울 강남구

curl -X POST http://localhost:8080/api/v1/naver/reverse-geocode-test \
  -H "Content-Type: application/json" \
  -d '{"lat": 35.1796, "lng": 129.0756}'  # 부산 해운대구
```

## 성능 및 캐싱

### React Query 캐싱 전략

- **staleTime**: 10분 (데이터가 신선하다고 간주되는 시간)
- **cacheTime**: 30분 (메모리에 캐시되는 시간)
- **재시도**: 4xx 에러는 재시도하지 않음, 5xx 에러는 최대 2회 재시도

### 요청 최적화

- 동일한 좌표에 대한 중복 요청 방지
- 유효하지 않은 좌표는 API 호출하지 않음
- 배치 처리로 여러 좌표 효율적 처리

## 보안 고려사항

1. **API 키 보호**: 환경변수로 관리, 프론트엔드에 노출되지 않음
2. **CORS 설정**: 백엔드에서 허용된 도메인만 접근 가능
3. **입력 검증**: Zod 스키마를 통한 엄격한 입력 검증
4. **에러 정보**: 민감한 정보가 포함된 에러는 필터링

## 주의사항

1. **API 키 활성화**: 네이버 클라우드 플랫폼에서 Maps API 서비스 활성화 필요
2. **도메인 설정**: 개발용으로 localhost, 127.0.0.1 허용 설정 필요
3. **서비스 활성화 시간**: API 키 발급 후 활성화까지 몇 분 소요 가능
4. **사용량 제한**: 무료 할당량 일 10,000건, 초과 시 과금
5. **좌표 정확성**: 위도(-90~90), 경도(-180~180) 범위 준수
6. **에러 처리**: 401 오류 시 자동으로 fallback 시스템 활용
7. **개발 환경**: 실제 API 키 문제 시 테스트용 엔드포인트로 개발 지속 가능

## 트러블슈팅

### 401 Unauthorized 오류가 지속되는 경우

1. **진단 엔드포인트 호출**:
   ```bash
   curl -X GET http://localhost:8080/api/v1/naver/diagnose
   ```

2. **네이버 클라우드 플랫폼 콘솔 확인**:
   - Maps API 서비스 활성화 상태 확인
   - 인증키 상태 및 도메인 제한 설정 확인
   - 서비스 사용량 및 결제 상태 확인

3. **API 키 재발급**:
   - 기존 API 키 비활성화 후 새로 발급
   - 도메인 제한을 다시 설정 (localhost, 127.0.0.1 포함)

4. **개발 지속**:
   - 테스트용 Mock 데이터 엔드포인트 활용
   - 프론트엔드 개발과 UI 테스트는 지속 가능

## 예시 컴포넌트

프론트엔드에 구현된 예시 컴포넌트를 통해 실제 사용법을 확인할 수 있습니다:

```
/client/src/components/NaverReverseGeocodeExample.tsx
```

이 컴포넌트는 개발 중 API 동작을 확인하고 테스트하는 데 유용합니다.