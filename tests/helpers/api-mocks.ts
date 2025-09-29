/**
 * @fileoverview API Mock 헬퍼 함수들
 * 외부 API 호출을 모킹하는 유틸리티 함수들
 */

import { jest } from '@jest/globals';

/**
 * 네이버 클라우드 API 모킹
 */
export function mockNaverCloudApi() {
  const mockReverseGeocode = jest.fn();

  const mockNaverCloudClient = {
    reverseGeocode: mockReverseGeocode,
    testConnection: jest.fn().mockResolvedValue(true)
  };

  return {
    mockNaverCloudClient,
    mockReverseGeocode,

    // 성공 응답 모킹
    mockReverseGeocodeSuccess: (address: string = '서울특별시 강남구 역삼동') => {
      mockReverseGeocode.mockResolvedValue({
        status: 200,
        data: {
          status: { code: 0 },
          results: [
            {
              name: 'addr',
              region: {
                area1: { name: '서울특별시' },
                area2: { name: '강남구' },
                area3: { name: '역삼동' }
              },
              land: {
                number1: '123',
                number2: '45'
              }
            },
            {
              name: 'roadaddr',
              region: {
                area1: { name: '서울특별시' },
                area2: { name: '강남구' },
                area3: { name: '역삼동' }
              },
              land: {
                number1: '강남대로 123'
              }
            }
          ]
        }
      });
    },

    // 에러 응답 모킹
    mockReverseGeocodeError: (statusCode: number = 500) => {
      const error = new Error('API Error');
      (error as any).statusCode = statusCode;
      mockReverseGeocode.mockRejectedValue(error);
    }
  };
}

/**
 * 네이버 검색 API 모킹
 */
export function mockNaverSearchApi() {
  const mockSearchLocal = jest.fn();

  const mockNaverSearchClient = {
    searchLocal: mockSearchLocal,
    testConnection: jest.fn().mockResolvedValue(true)
  };

  return {
    mockNaverSearchClient,
    mockSearchLocal,

    // 성공 응답 모킹
    mockSearchLocalSuccess: (places: any[] = []) => {
      mockSearchLocal.mockResolvedValue({
        status: 200,
        data: {
          lastBuildDate: new Date().toISOString(),
          total: places.length,
          start: 1,
          display: places.length,
          items: places
        }
      });
    },

    // 에러 응답 모킹
    mockSearchLocalError: (statusCode: number = 500) => {
      const error = new Error('API Error');
      (error as any).statusCode = statusCode;
      mockSearchLocal.mockRejectedValue(error);
    }
  };
}

/**
 * 카카오 API 모킹
 */
export function mockKakaoApi() {
  const mockSearchPlaces = jest.fn();
  const mockAddress2Coord = jest.fn();
  const mockCoord2Address = jest.fn();

  const mockKakaoApiClient = {
    searchPlaces: mockSearchPlaces,
    address2Coord: mockAddress2Coord,
    coord2Address: mockCoord2Address,
    testConnection: jest.fn().mockResolvedValue(true)
  };

  return {
    mockKakaoApiClient,
    mockSearchPlaces,
    mockAddress2Coord,
    mockCoord2Address,

    // 성공 응답 모킹
    mockKakaoSuccess: (documents: any[] = []) => {
      const mockResponse = {
        status: 200,
        data: {
          documents,
          meta: {
            total_count: documents.length,
            pageable_count: documents.length,
            is_end: true
          }
        }
      };

      mockSearchPlaces.mockResolvedValue(mockResponse);
      mockAddress2Coord.mockResolvedValue(mockResponse);
      mockCoord2Address.mockResolvedValue(mockResponse);
    },

    // 에러 응답 모킹
    mockKakaoError: (statusCode: number = 500) => {
      const error = new Error('API Error');
      (error as any).statusCode = statusCode;

      mockSearchPlaces.mockRejectedValue(error);
      mockAddress2Coord.mockRejectedValue(error);
      mockCoord2Address.mockRejectedValue(error);
    }
  };
}

/**
 * 모든 외부 API 모킹 초기화
 */
export function resetAllMocks() {
  jest.clearAllMocks();
}