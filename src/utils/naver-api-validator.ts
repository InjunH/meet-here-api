/**
 * @fileoverview 네이버 클라우드 플랫폼 API 유효성 검사 유틸리티
 */

import axios from 'axios';
import { logger } from '@/utils/logger.js';

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
    const testResponse = await axios.get(
      'https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc',
      {
        params: {
          coords: '127.0311352,37.2635694', // 수원시청 좌표
          orders: 'roadaddr',
          output: 'json'
        },
        headers: {
          'X-NCP-APIGW-API-KEY-ID': clientId,
          'X-NCP-APIGW-API-KEY': clientSecret
        },
        timeout: 5000
      }
    );

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
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;

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