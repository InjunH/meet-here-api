/**
 * @fileoverview Naver API Validator 단위 테스트
 */

import { describe, it, expect } from '@jest/globals';
import { validateCoordinates, validateSearchQuery } from '../../src/utils/naver-api-validator';
import { TEST_COORDINATES } from '../helpers/test-data';

describe('Naver API Validator Unit Tests', () => {
  describe('validateCoordinates', () => {
    it('유효한 좌표를 통과시켜야 한다', () => {
      const validCoordinates = [
        TEST_COORDINATES.SEOUL_STATION,
        TEST_COORDINATES.GANGNAM_STATION,
        TEST_COORDINATES.HONGDAE,
        TEST_COORDINATES.BUSAN_STATION
      ];

      validCoordinates.forEach(coord => {
        expect(() => {
          validateCoordinates(coord.lat, coord.lng);
        }).not.toThrow();
      });
    });

    it('한국 범위 내의 극단 좌표를 통과시켜야 한다', () => {
      // 한국의 대략적인 경계선 좌표들
      const koreanBounds = [
        { lat: 33.0, lng: 125.0 },   // 남서쪽 (제주도 남쪽)
        { lat: 38.5, lng: 131.0 },   // 북동쪽 (독도 근처)
        { lat: 37.5, lng: 124.5 },   // 서쪽 (백령도 근처)
        { lat: 35.0, lng: 129.5 }    // 동쪽 (울산 근처)
      ];

      koreanBounds.forEach(coord => {
        expect(() => {
          validateCoordinates(coord.lat, coord.lng);
        }).not.toThrow();
      });
    });

    it('범위를 벗어난 위도에 대해 에러를 발생시켜야 한다', () => {
      const invalidLatitudes = [
        { lat: 91, lng: 127 },    // 위도 상한 초과
        { lat: -91, lng: 127 },   // 위도 하한 초과
        { lat: 32, lng: 127 },    // 한국 범위 아래
        { lat: 40, lng: 127 }     // 한국 범위 위
      ];

      invalidLatitudes.forEach(coord => {
        expect(() => {
          validateCoordinates(coord.lat, coord.lng);
        }).toThrow();
      });
    });

    it('범위를 벗어난 경도에 대해 에러를 발생시켜야 한다', () => {
      const invalidLongitudes = [
        { lat: 37, lng: 181 },    // 경도 상한 초과
        { lat: 37, lng: -181 },   // 경도 하한 초과
        { lat: 37, lng: 123 },    // 한국 범위 서쪽
        { lat: 37, lng: 133 }     // 한국 범위 동쪽
      ];

      invalidLongitudes.forEach(coord => {
        expect(() => {
          validateCoordinates(coord.lat, coord.lng);
        }).toThrow();
      });
    });

    it('NaN 값에 대해 에러를 발생시켜야 한다', () => {
      const nanValues = [
        { lat: NaN, lng: 127 },
        { lat: 37, lng: NaN },
        { lat: NaN, lng: NaN }
      ];

      nanValues.forEach(coord => {
        expect(() => {
          validateCoordinates(coord.lat, coord.lng);
        }).toThrow();
      });
    });

    it('무한대 값에 대해 에러를 발생시켜야 한다', () => {
      const infinityValues = [
        { lat: Infinity, lng: 127 },
        { lat: 37, lng: Infinity },
        { lat: -Infinity, lng: -Infinity }
      ];

      infinityValues.forEach(coord => {
        expect(() => {
          validateCoordinates(coord.lat, coord.lng);
        }).toThrow();
      });
    });
  });

  describe('validateSearchQuery', () => {
    it('유효한 검색어를 통과시켜야 한다', () => {
      const validQueries = [
        '강남역',
        '서울역',
        '스타벅스',
        'Starbucks',
        '123',
        'ABC',
        '한글English123',
        '맛집 추천'
      ];

      validQueries.forEach(query => {
        expect(() => {
          validateSearchQuery(query);
        }).not.toThrow();
      });
    });

    it('빈 검색어에 대해 에러를 발생시켜야 한다', () => {
      const emptyQueries = ['', '   ', '\t', '\n'];

      emptyQueries.forEach(query => {
        expect(() => {
          validateSearchQuery(query);
        }).toThrow();
      });
    });

    it('너무 긴 검색어에 대해 에러를 발생시켜야 한다', () => {
      const longQuery = 'a'.repeat(201); // 200자 초과

      expect(() => {
        validateSearchQuery(longQuery);
      }).toThrow();
    });

    it('공백만 있는 검색어에 대해 에러를 발생시켜야 한다', () => {
      const whitespaceQueries = [
        '   ',
        '\t\t\t',
        '\n\n\n',
        ' \t \n '
      ];

      whitespaceQueries.forEach(query => {
        expect(() => {
          validateSearchQuery(query);
        }).toThrow();
      });
    });

    it('특수문자가 포함된 검색어를 통과시켜야 한다', () => {
      const specialCharQueries = [
        '서울역 1번출구',
        '스타벅스(강남점)',
        '맛집@강남',
        '카페#홍대',
        '음식점-종로',
        '편의점&마트'
      ];

      specialCharQueries.forEach(query => {
        expect(() => {
          validateSearchQuery(query);
        }).not.toThrow();
      });
    });

    it('경계선 길이의 검색어를 올바르게 처리해야 한다', () => {
      const exactLengthQuery = 'a'.repeat(200); // 정확히 200자
      const justOverQuery = 'a'.repeat(201);    // 201자

      expect(() => {
        validateSearchQuery(exactLengthQuery);
      }).not.toThrow();

      expect(() => {
        validateSearchQuery(justOverQuery);
      }).toThrow();
    });

    it('null과 undefined에 대해 에러를 발생시켜야 한다', () => {
      expect(() => {
        validateSearchQuery(null as any);
      }).toThrow();

      expect(() => {
        validateSearchQuery(undefined as any);
      }).toThrow();
    });
  });

  describe('통합 검증 시나리오', () => {
    it('실제 사용 사례와 유사한 데이터를 검증해야 한다', () => {
      // 역지오코딩 시나리오
      expect(() => {
        validateCoordinates(37.5665, 126.9780); // 서울 시청
      }).not.toThrow();

      // 장소 검색 시나리오
      expect(() => {
        validateSearchQuery('강남역 맛집');
      }).not.toThrow();

      // 자동완성 시나리오
      expect(() => {
        validateSearchQuery('스타');
      }).not.toThrow();
    });

    it('경계값 테스트를 수행해야 한다', () => {
      // 위도 경계값
      expect(() => {
        validateCoordinates(33.0, 127.0); // 최소 위도
      }).not.toThrow();

      expect(() => {
        validateCoordinates(38.6, 127.0); // 최대 위도
      }).not.toThrow();

      // 경도 경계값
      expect(() => {
        validateCoordinates(37.0, 124.0); // 최소 경도
      }).not.toThrow();

      expect(() => {
        validateCoordinates(37.0, 132.0); // 최대 경도
      }).not.toThrow();

      // 검색어 길이 경계값
      expect(() => {
        validateSearchQuery('a'); // 최소 길이
      }).not.toThrow();

      expect(() => {
        validateSearchQuery('a'.repeat(200)); // 최대 길이
      }).not.toThrow();
    });
  });
});