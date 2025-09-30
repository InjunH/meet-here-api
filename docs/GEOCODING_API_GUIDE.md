# 역지오코딩 API 가이드

## 개요

역지오코딩(Reverse Geocoding) API는 좌표(위도, 경도)를 사용자 친화적인 주소 정보로 변환하는 서비스입니다. 네이버 클라우드 플랫폼의 Reverse Geocoding API를 활용하여 구현되었습니다.

## 주요 기능

- **좌표 → 주소 변환**: 하나의 좌표를 지번주소와 도로명주소로 변환
- **간단한 위치명**: "서울특별시 강남구 역삼동" → "역삼동 근처"로 표시
- **상세 정보 제공**: 시/도, 구/군, 동/읍/면 단위 세부 정보
- **에러 처리**: 잘못된 좌표, API 장애 등 다양한 에러 상황 처리

---

## API 엔드포인트

### 역지오코딩 (Reverse Geocoding)

**POST** `/api/v1/naver/reverse-geocode`

#### 요청 (Request)

```json
{
  "lat": 37.5223,  // 위도 (-90 ~ 90)
  "lng": 127.0329  // 경도 (-180 ~ 180)
}
```

**파라미터**:
- `lat` (number, 필수): 위도 값 (-90 ~ 90 범위)
- `lng` (number, 필수): 경도 값 (-180 ~ 180 범위)

#### 응답 (Response)

**성공 (200 OK)**:
```json
{
  "success": true,
  "data": {
    "address": "서울특별시 강남구 역삼동 737",
    "roadAddress": "서울특별시 강남구 테헤란로 212",
    "district": "서울특별시 강남구 역삼동",
    "displayName": "역삼동 근처",
    "coordinates": {
      "lat": 37.5223,
      "lng": 127.0329
    }
  },
  "timestamp": "2024-09-30T12:00:00.000Z"
}
```

**에러 (400 Bad Request)** - 잘못된 좌표 범위:
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "잘못된 요청 형식입니다",
  "details": {
    "errors": [
      {
        "field": "lat",
        "message": "위도는 90 이하여야 합니다"
      }
    ]
  },
  "timestamp": "2024-09-30T12:00:00.000Z"
}
```

**에러 (404 Not Found)** - 주소를 찾을 수 없음:
```json
{
  "success": false,
  "error": "ADDRESS_NOT_FOUND",
  "message": "해당 위치의 주소를 찾을 수 없습니다",
  "timestamp": "2024-09-30T12:00:00.000Z"
}
```

**에러 (500 Internal Server Error)** - API 장애:
```json
{
  "success": false,
  "error": "GEOCODING_ERROR",
  "message": "위치 정보 처리 중 오류가 발생했습니다",
  "timestamp": "2024-09-30T12:00:00.000Z"
}
```

#### 사용 예시

**cURL**:
```bash
curl -X POST http://localhost:8080/api/v1/naver/reverse-geocode \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 37.5223,
    "lng": 127.0329
  }'
```

**JavaScript (Fetch)**:
```javascript
const response = await fetch('http://localhost:8080/api/v1/naver/reverse-geocode', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    lat: 37.5223,
    lng: 127.0329
  })
});

const result = await response.json();
console.log(result.data.displayName); // "역삼동 근처"
```


---

## 응답 데이터 구조

### ReverseGeocodeResult

| 필드 | 타입 | 설명 |
|------|------|------|
| `address` | string | 지번 주소 (예: "서울특별시 강남구 역삼동 737") |
| `roadAddress` | string | 도로명 주소 (예: "서울특별시 강남구 테헤란로 212") |
| `district` | string | 행정구역 (예: "서울특별시 강남구 역삼동") |
| `displayName` | string | **표시용 간단한 위치명** (예: "역삼동 근처") |
| `coordinates` | object | 좌표 정보 |
| `coordinates.lat` | number | 위도 |
| `coordinates.lng` | number | 경도 |

---

## 에러 코드

| HTTP Status | 에러 메시지 | 설명 |
|-------------|-------------|------|
| 400 | Bad Request | 요청 데이터 검증 실패 (좌표 범위 오류) |
| 404 | Not Found | 해당 좌표에 대한 주소를 찾을 수 없음 |
| 500 | Internal Server Error | 네이버 API 호출 실패 |
| 503 | Service Unavailable | 네이버 API 인증 오류 |

---

## displayName 생성 규칙

표시용 간단한 위치명(`displayName`)은 다음 우선순위로 생성됩니다:

1. **area3이 있는 경우**: `"{area3} 근처"`
   - 예: "역삼동 근처", "정자동 근처"

2. **area3이 없고 area2가 있는 경우**: `"{area2} 근처"`
   - 예: "강남구 근처", "분당구 근처"

3. **area2도 없고 area1만 있는 경우**: `"{area1} 근처"`
   - 예: "서울특별시 근처", "경기도 근처"

4. **모든 정보가 없는 경우**: `"위치 확인 중"`

---

## 사용 시 주의사항

1. **좌표 범위**
   - 위도: -90 ~ 90
   - 경도: -180 ~ 180
   - 범위 외 좌표는 400 에러 반환

2. **API 키 설정**
   - 네이버 클라우드 플랫폼 API 키 필요
   - 환경변수 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 설정 필수
   - 설정 방법: [네이버 API 통합 가이드](./naver-api-integration.md) 참조

3. **성능**
   - 평균 응답 시간: 200-500ms
   - 타임아웃: 10초
   - 자동 재시도: 최대 2회

4. **에러 처리**
   - 네트워크 장애, API 장애 등 예외 상황 대비
   - 프론트엔드에서 폴백 처리 권장 (좌표 표시)

---

## 통합 가이드

### Frontend 통합 예시

```typescript
// geocoding.service.ts
export async function reverseGeocode(lat: number, lng: number) {
  try {
    const response = await fetch('/api/v1/naver/reverse-geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng })
    });

    if (!response.ok) {
      throw new Error('Geocoding failed');
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('Geocoding error:', error);
    // 폴백: 좌표 표시
    return {
      displayName: `(${lat.toFixed(4)}, ${lng.toFixed(4)}) 근처`,
      address: '위치 정보 없음'
    };
  }
}

// 사용
const midpoint = calculateMidpoint(locations);
const locationInfo = await reverseGeocode(midpoint.lat, midpoint.lng);
console.log(locationInfo.displayName); // "역삼동 근처"
```

### React 컴포넌트 예시

```typescript
const MapComponent = () => {
  const [locationName, setLocationName] = useState('위치 확인 중...');

  useEffect(() => {
    const fetchLocation = async () => {
      const result = await reverseGeocode(37.5223, 127.0329);
      setLocationName(result.displayName);
    };

    fetchLocation();
  }, []);

  return <div>📍 {locationName}</div>;
};
```

---

## 관련 문서

- [네이버 API 통합 가이드](./naver-api-integration.md)
- [에러 처리 가이드](./ERROR_HANDLING_GUIDE.md)
- [API 베스트 프랙티스](./API_BEST_PRACTICES.md)

---

## 지원

문제가 발생하거나 질문이 있으시면 이슈를 등록해주세요.