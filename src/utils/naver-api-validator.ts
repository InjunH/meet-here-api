/**
 * @fileoverview 네이버 클라우드 플랫폼 API 유효성 검사 유틸리티
 */

import { logger } from '@/utils/logger.js';
import { naverCloudClient } from '@/lib/api-clients.js';
import { AppError } from '@/middleware/errorHandler.js';

interface NaverApiValidationResult {
  isValid: boolean;
  errorType?: 'CREDENTIALS_MISSING' | 'CREDENTIALS_INVALID' | 'SERVICE_INACTIVE' | 'NETWORK_ERROR';
  errorMessage?: string;
  suggestion?: string;
}

/**
 * 네이버 클라우드 플랫폼 API 키 유효성 검사
 * @param clientId 네이버 API Client ID
 * @param clientSecret 네이버 API Client Secret
 * @returns 검증 결과
 */
export async function validateNaverApiCredentials(
  clientId?: string,
  clientSecret?: string
): Promise<NaverApiValidationResult> {
  // 환경변수 검증
  if (!clientId || !clientSecret) {
    return {
      isValid: false,
      errorType: 'CREDENTIALS_MISSING',
      errorMessage: '네이버 API 인증 정보가 설정되지 않았습니다',
      suggestion: '.env 파일에 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 설정하세요'
    };
  }

  try {
    // 실제 API 호출로 검증 (수원시청 좌표 사용)
    const testResponse = await naverCloudClient.reverseGeocode('127.0311352,37.2635694', {
      orders: 'roadaddr',
      output: 'json'
    });

    // API 응답 성공
    if (testResponse.status === 200 && testResponse.data.status?.code === 0) {
      logger.info('Naver API credentials validation successful');
      return { isValid: true };
    }

    // API는 응답했지만 오류 상태
    return {
      isValid: false,
      errorType: 'SERVICE_INACTIVE',
      errorMessage: `네이버 API 서비스 오류: ${testResponse.data.status?.message || '알 수 없는 오류'}`,
      suggestion: '네이버 클라우드 플랫폼 콘솔에서 Maps API 서비스 활성화 상태를 확인하세요'
    };

  } catch (error) {
    if (error instanceof AppError) {
      const status = error.statusCode;

      if (status === 401) {
        return {
          isValid: false,
          errorType: 'CREDENTIALS_INVALID',
          errorMessage: 'API 키 인증 실패 (401 Unauthorized)',
          suggestion: '네이버 클라우드 플랫폼 콘솔에서 API 키를 다시 확인하고 재발급받으세요'
        };
      }

      if (status === 403) {
        return {
          isValid: false,
          errorType: 'SERVICE_INACTIVE',
          errorMessage: 'API 서비스 접근 권한 없음 (403 Forbidden)',
          suggestion: '네이버 클라우드 플랫폼에서 Maps API 서비스를 활성화하고 도메인 제한 설정을 확인하세요'
        };
      }

      return {
        isValid: false,
        errorType: 'NETWORK_ERROR',
        errorMessage: `네트워크 오류: ${error.message}`,
        suggestion: '네트워크 연결을 확인하고 다시 시도하세요'
      };
    }

    return {
      isValid: false,
      errorType: 'NETWORK_ERROR',
      errorMessage: '알 수 없는 오류가 발생했습니다',
      suggestion: '나중에 다시 시도하거나 시스템 로그를 확인하세요'
    };
  }
}

/**
 * 좌표 유효성 검증
 * @param lat 위도
 * @param lng 경도
 * @throws AppError 유효하지 않은 좌표인 경우
 */
export function validateCoordinates(lat: number, lng: number): void {
  // NaN, Infinity 체크
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new AppError('좌표 값이 유효하지 않습니다', 400, 'VALIDATION_ERROR');
  }

  // 위도 범위 체크 (-90 ~ 90)
  if (lat < -90 || lat > 90) {
    throw new AppError('위도는 -90에서 90 사이여야 합니다', 400, 'VALIDATION_ERROR');
  }

  // 경도 범위 체크 (-180 ~ 180)
  if (lng < -180 || lng > 180) {
    throw new AppError('경도는 -180에서 180 사이여야 합니다', 400, 'VALIDATION_ERROR');
  }

  // 한국 지역 좌표 범위 체크
  const KOREA_BOUNDS = {
    minLat: 33.0,  // 제주도 남쪽
    maxLat: 38.6,  // 휴전선 근처
    minLng: 124.0, // 서해
    maxLng: 132.0  // 동해
  };

  if (lat < KOREA_BOUNDS.minLat || lat > KOREA_BOUNDS.maxLat) {
    throw new AppError('좌표가 한국 지역을 벗어났습니다', 400, 'VALIDATION_ERROR');
  }

  if (lng < KOREA_BOUNDS.minLng || lng > KOREA_BOUNDS.maxLng) {
    throw new AppError('좌표가 한국 지역을 벗어났습니다', 400, 'VALIDATION_ERROR');
  }
}

/**
 * 검색어 유효성 검증
 * @param query 검색어
 * @throws AppError 유효하지 않은 검색어인 경우
 */
export function validateSearchQuery(query: string): void {
  // null, undefined 체크
  if (query === null || query === undefined) {
    throw new AppError('검색어가 필요합니다', 400, 'VALIDATION_ERROR');
  }

  // 빈 문자열 또는 공백만 있는 경우
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new AppError('유효한 검색어를 입력해주세요', 400, 'VALIDATION_ERROR');
  }

  // 길이 체크 (최대 200자)
  if (query.length > 200) {
    throw new AppError('검색어는 200자를 초과할 수 없습니다', 400, 'VALIDATION_ERROR');
  }
}

/**
 * 네이버 API 키 설정 가이드 메시지 생성
 * @returns 설정 가이드 문자열
 */
export function getNaverApiSetupGuide(): string {
  return `
네이버 클라우드 플랫폼 API 설정 가이드:

1. 네이버 클라우드 플랫폼 콘솔 접속 (https://console.ncloud.com/)
2. AI·Application Service > Maps > Reverse Geocoding 서비스 신청
3. 인증키 관리에서 새로운 인증키 생성
4. Application 이름 설정 및 Service 선택 (Reverse Geocoding)
5. Web Dynamic Map / Static Map 체크
6. 도메인 설정: localhost, 127.0.0.1 추가 (개발용)
7. 생성된 Client ID와 Client Secret을 .env 파일에 설정:
   NAVER_CLIENT_ID=생성된_클라이언트_ID
   NAVER_CLIENT_SECRET=생성된_클라이언트_시크릿
8. 서버 재시작 후 /api/v1/naver/health 엔드포인트로 설정 확인

주의사항:
- API 키 발급 후 활성화까지 몇 분 소요될 수 있음
- 무료 할당량: 일 10,000건 (초과 시 과금)
- 도메인 제한 설정 시 정확한 도메인 입력 필요
  `;
}