/**
 * @fileoverview 테스트 데이터 생성 헬퍼 함수들
 * 테스트에서 사용할 가짜 데이터 생성
 */

/**
 * 테스트용 좌표 데이터
 */
export const TEST_COORDINATES = {
  SEOUL_STATION: { lat: 37.5547, lng: 126.9707 },
  GANGNAM_STATION: { lat: 37.4979, lng: 127.0276 },
  HONGDAE: { lat: 37.5561, lng: 126.9244 },
  BUSAN_STATION: { lat: 35.1156, lng: 129.0403 },
  INVALID: { lat: 91, lng: 181 } // 유효하지 않은 좌표
} as const;

/**
 * 네이버 API 응답 데이터 생성
 */
export function createNaverReverseGeocodeResponse(options: {
  address?: string;
  roadAddress?: string;
  area1?: string;
  area2?: string;
  area3?: string;
} = {}) {
  const {
    address = '서울특별시 강남구 역삼동 123-45',
    roadAddress = '서울특별시 강남구 강남대로 123',
    area1 = '서울특별시',
    area2 = '강남구',
    area3 = '역삼동'
  } = options;

  return {
    status: { code: 0, name: 'ok', message: 'done' },
    results: [
      {
        name: 'addr',
        region: {
          area1: { name: area1 },
          area2: { name: area2 },
          area3: { name: area3 }
        },
        land: {
          number1: '123',
          number2: '45'
        }
      },
      {
        name: 'roadaddr',
        region: {
          area1: { name: area1 },
          area2: { name: area2 },
          area3: { name: area3 }
        },
        land: {
          number1: '강남대로 123'
        }
      }
    ]
  };
}

/**
 * 네이버 Local Search 응답 데이터 생성
 */
export function createNaverLocalSearchResponse(places: Array<{
  title?: string;
  category?: string;
  address?: string;
  roadAddress?: string;
  mapx?: string;
  mapy?: string;
}> = []) {
  const defaultPlace = {
    title: '스타벅스 강남역점',
    link: 'https://www.starbucks.co.kr',
    category: '음식점>카페>커피전문점',
    description: '커피전문점',
    telephone: '02-1234-5678',
    address: '서울특별시 강남구 역삼동 123-45',
    roadAddress: '서울특별시 강남구 강남대로 123',
    mapx: '1270276123',
    mapy: '374979456'
  };

  const items = places.length > 0
    ? places.map((place, index) => ({
        ...defaultPlace,
        ...place,
        mapx: place.mapx || `127027612${index}`,
        mapy: place.mapy || `37497945${index}`
      }))
    : [defaultPlace];

  return {
    lastBuildDate: new Date().toISOString(),
    total: items.length,
    start: 1,
    display: items.length,
    items
  };
}

/**
 * 카카오 API 응답 데이터 생성
 */
export function createKakaoSearchResponse(places: Array<{
  id?: string;
  place_name?: string;
  category_name?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
  phone?: string;
  place_url?: string;
}> = []) {
  const defaultPlace = {
    id: '26853371',
    place_name: '스타벅스 강남역점',
    category_name: '음식점 > 카페 > 커피전문점',
    category_group_code: 'CE7',
    category_group_name: '카페',
    phone: '02-1522-3232',
    address_name: '서울 강남구 역삼동 123-45',
    road_address_name: '서울 강남구 강남대로 123',
    x: '127.0276',
    y: '37.4979',
    place_url: 'http://place.map.kakao.com/26853371',
    distance: '150'
  };

  const documents = places.length > 0
    ? places.map((place, index) => ({
        ...defaultPlace,
        id: place.id || `${26853371 + index}`,
        ...place
      }))
    : [defaultPlace];

  return {
    documents,
    meta: {
      total_count: documents.length,
      pageable_count: documents.length,
      is_end: true
    }
  };
}

/**
 * 지하철역 데이터 생성
 */
export function createSubwayStations() {
  return [
    {
      id: '0150',
      name: '강남',
      line: '2호선',
      lat: 37.4979,
      lng: 127.0276
    },
    {
      id: '0151',
      name: '역삼',
      line: '2호선',
      lat: 37.5006,
      lng: 127.0364
    },
    {
      id: '239',
      name: '강남구청',
      line: '7호선',
      lat: 37.5172,
      lng: 127.0473
    }
  ];
}

/**
 * HTTP 에러 응답 생성
 */
export function createErrorResponse(
  message: string = 'Internal Server Error',
  statusCode: number = 500,
  errorCode: string = 'INTERNAL_ERROR'
) {
  return {
    success: false,
    error: statusCode >= 500 ? 'Internal Server Error' : 'Bad Request',
    message,
    errorCode,
    timestamp: expect.any(String)
  };
}

/**
 * 성공 응답 형태 생성
 */
export function createSuccessResponse(data: any, message: string = 'Success') {
  return {
    success: true,
    data,
    message,
    timestamp: expect.any(String)
  };
}