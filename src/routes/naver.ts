/**
 * @fileoverview 네이버 클라우드 플랫폼 API 프록시 라우터
 * Reverse Geocoding API를 프록시로 제공하여 CORS 문제 해결
 */

import express from 'express';
import axios from 'axios';
import { z } from 'zod';
import { logger } from '@/utils/logger.js';
import { validateNaverApiCredentials, getNaverApiSetupGuide } from '@/utils/naver-api-validator.js';
import { naverSearchService } from '@/services/naver-search.service.js';

const router = express.Router();


// Reverse Geocoding 요청 스키마
const reverseGeocodeRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
});

// 자동완성 요청 스키마
const autocompleteRequestSchema = z.object({
  query: z.string().min(2, '검색어는 최소 2글자 이상이어야 합니다').max(100, '검색어는 100글자를 초과할 수 없습니다'),
  limit: z.number().min(1).max(5).optional().default(5)
});

// 네이버 API 응답 타입
interface NaverReverseGeocodeResponse {
  status: {
    code: number;
    name: string;
    message: string;
  };
  results: Array<{
    name: string;
    code: {
      id: string;
      type: string;
      mappingId: string;
    };
    region: {
      area0: { name: string; coords: { center: { x: number; y: number } } };
      area1: { name: string; coords: { center: { x: number; y: number } } };
      area2: { name: string; coords: { center: { x: number; y: number } } };
      area3: { name: string; coords: { center: { x: number; y: number } } };
      area4: { name: string; coords: { center: { x: number; y: number } } };
    };
    land?: {
      type: string;
      number1: string;
      number2: string;
      addition0?: {
        type: string;
        value: string;
      };
      addition1?: {
        type: string;
        value: string;
      };
      addition2?: {
        type: string;
        value: string;
      };
      addition3?: {
        type: string;
        value: string;
      };
      addition4?: {
        type: string;
        value: string;
      };
    };
  }>;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     ReverseGeocodeRequest:
 *       type: object
 *       required:
 *         - lat
 *         - lng
 *       properties:
 *         lat:
 *           type: number
 *           minimum: -90
 *           maximum: 90
 *           description: 위도
 *           example: 37.3595704
 *         lng:
 *           type: number
 *           minimum: -180
 *           maximum: 180
 *           description: 경도
 *           example: 127.105399
 *
 *     ReverseGeocodeResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: 요청 성공 여부
 *         data:
 *           type: object
 *           properties:
 *             address:
 *               type: string
 *               description: 지번 주소
 *               example: "경기도 수원시 영통구 이의동 1304-4"
 *             roadAddress:
 *               type: string
 *               description: 도로명 주소
 *               example: "경기도 수원시 영통구 광교산로 154-42"
 *             district:
 *               type: string
 *               description: 행정구역
 *               example: "경기도 수원시 영통구"
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: 응답 시간
 */

/**
 * @swagger
 * /api/v1/naver/reverse-geocode:
 *   post:
 *     summary: 좌표를 주소로 변환 (Reverse Geocoding)
 *     description: 위도/경도 좌표를 한국 주소로 변환합니다. 네이버 클라우드 플랫폼의 Reverse Geocoding API를 프록시로 제공합니다.
 *     tags: [Naver API]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReverseGeocodeRequest'
 *     responses:
 *       200:
 *         description: 성공적으로 주소를 조회했습니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReverseGeocodeResponse'
 *       400:
 *         description: 잘못된 요청 (좌표 형식 오류)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Bad Request"
 *                 message:
 *                   type: string
 *                   example: "위도는 -90~90 범위여야 합니다"
 *       500:
 *         description: 서버 내부 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Internal Server Error"
 *                 message:
 *                   type: string
 *                   example: "네이버 API 호출 중 오류가 발생했습니다"
 */
router.post('/reverse-geocode', async (req, res) => {
  const requestId = req.headers['x-request-id'] || 'unknown';

  try {
    // 요청 데이터 검증
    const validationResult = reverseGeocodeRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      logger.warn('Reverse geocoding validation failed', {
        requestId,
        errors: validationResult.error.errors,
        body: req.body
      });

      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: validationResult.error.errors[0]?.message || '잘못된 요청입니다',
        timestamp: new Date().toISOString()
      });
    }

    const { lat, lng } = validationResult.data;

    // 환경변수 확인
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      logger.error('Naver API credentials not configured', { requestId });
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: '네이버 API 인증 정보가 설정되지 않았습니다',
        timestamp: new Date().toISOString()
      });
    }

    logger.info('Reverse geocoding request', {
      requestId,
      lat,
      lng,
      userAgent: req.headers['user-agent']
    });

    // 네이버 클라우드 플랫폼 API 연결 상태 진단
    const coords = encodeURIComponent(`${lng},${lat}`);
    const apiUrl = `https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc?request=coordsToaddr&coords=${coords}&sourcecrs=epsg:4326&orders=admcode,legalcode,addr,roadaddr&output=json`;

    logger.info('Naver API request details', {
      requestId,
      clientId,
      clientSecretMasked: clientSecret ? `${clientSecret.substring(0, 4)}****${clientSecret.substring(clientSecret.length - 4)}` : 'null',
      coords: `${lng},${lat}`,
      url: apiUrl
    });

    // 네이버 클라우드 플랫폼 Reverse Geocoding API 호출 (GET 방식)
    const naverResponse = await axios.get<NaverReverseGeocodeResponse>(apiUrl, {
      headers: {
        'x-ncp-apigw-api-key-id': clientId,
        'x-ncp-apigw-api-key': clientSecret
      },
      timeout: 10000 // 10초 타임아웃
    });

    // API 응답 확인
    if (naverResponse.data.status.code !== 0) {
      logger.warn('Naver API returned error', {
        requestId,
        statusCode: naverResponse.data.status.code,
        statusMessage: naverResponse.data.status.message,
        lat,
        lng
      });

      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `좌표 변환 실패: ${naverResponse.data.status.message}`,
        timestamp: new Date().toISOString()
      });
    }

    // 결과 데이터 처리
    const results = naverResponse.data.results;
    if (!results || results.length === 0) {
      logger.warn('No geocoding results found', { requestId, lat, lng });

      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: '해당 좌표에 대한 주소를 찾을 수 없습니다',
        timestamp: new Date().toISOString()
      });
    }

    // 도로명주소와 지번주소 찾기
    const roadAddrResult = results.find(result => result.name === 'roadaddr');
    const addrResult = results.find(result => result.name === 'addr');

    // 주소 문자열 생성 함수
    const buildAddress = (result: typeof results[0], includeDetails: boolean = true): string => {
      const region = result.region;
      const baseAddress = [
        region.area1?.name,  // 시/도
        region.area2?.name,  // 시/군/구
        region.area3?.name,  // 읍/면/동
      ].filter(Boolean).join(' ');

      if (!includeDetails || !result.land) {
        return baseAddress;
      }

      // 상세 주소 추가
      const details = [];

      if (result.land.number1) {
        details.push(result.land.number1);
      }
      if (result.land.number2) {
        details.push(`-${result.land.number2}`);
      }

      // 추가 정보 (건물명, 층수 등)
      const additions = [
        result.land.addition0?.value,
        result.land.addition1?.value,
        result.land.addition2?.value,
        result.land.addition3?.value,
        result.land.addition4?.value
      ].filter(Boolean);

      return [baseAddress, details.join(''), ...additions]
        .filter(Boolean)
        .join(' ');
    };

    // 행정구역 정보
    const district = [
      addrResult?.region.area1?.name || roadAddrResult?.region.area1?.name,  // 시/도
      addrResult?.region.area2?.name || roadAddrResult?.region.area2?.name,  // 시/군/구
      addrResult?.region.area3?.name || roadAddrResult?.region.area3?.name   // 읍/면/동
    ].filter(Boolean).join(' ');

    // 응답 데이터 구성
    const responseData = {
      address: addrResult ? buildAddress(addrResult) : '',
      roadAddress: roadAddrResult ? buildAddress(roadAddrResult) : '',
      district
    };

    logger.info('Reverse geocoding successful', {
      requestId,
      lat,
      lng,
      hasRoadAddr: !!roadAddrResult,
      hasAddr: !!addrResult,
      district
    });

    res.json({
      success: true,
      data: responseData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Reverse geocoding failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body
    });

    // Axios 에러인 경우 상태 코드 확인
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const responseData = error.response?.data;
      const message = responseData?.message || error.message;

      logger.error('Naver API Error Details', {
        requestId,
        status,
        statusText: error.response?.statusText,
        responseData,
        responseHeaders: error.response?.headers,
        requestHeaders: {
          'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
          'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET ? 'configured' : 'missing'
        }
      });

      // 401 에러의 경우 상세한 진단 정보 제공
      if (status === 401) {
        const currentClientId = process.env.NAVER_CLIENT_ID;
        const currentClientSecret = process.env.NAVER_CLIENT_SECRET;
        const diagnosisMessage = `네이버 API 인증 오류 (401): API 키 확인 필요\n` +
          `- Client ID: ${currentClientId}\n` +
          `- Client Secret: ${currentClientSecret ? '설정됨' : '미설정'}\n` +
          `- 가능한 원인: 1) API 키가 잘못되었음 2) 네이버 클라우드 플랫폼에서 서비스가 활성화되지 않음 3) 도메인 제한 설정 문제\n` +
          `- 대안: /api/v1/naver/reverse-geocode-test 엔드포인트 사용 (Mock 데이터)`;

        return res.status(503).json({
          success: false,
          error: 'Service Unavailable',
          message: diagnosisMessage,
          fallback: {
            available: true,
            endpoint: '/api/v1/naver/reverse-geocode-test',
            description: '테스트용 Mock 데이터 제공'
          },
          timestamp: new Date().toISOString()
        });
      }

      return res.status(status).json({
        success: false,
        error: status >= 500 ? 'Internal Server Error' : 'Bad Request',
        message: `네이버 API 호출 실패: ${message}`,
        timestamp: new Date().toISOString()
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '역지오코딩 처리 중 오류가 발생했습니다',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/v1/naver/health:
 *   get:
 *     summary: 네이버 API 서비스 상태 확인
 *     description: 네이버 클라우드 플랫폼 API 연결 상태를 확인합니다.
 *     tags: [Naver API]
 *     responses:
 *       200:
 *         description: 네이버 API 서비스 정상
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 service:
 *                   type: string
 *                   example: "naver-api"
 *                 status:
 *                   type: string
 *                   example: "healthy"
 *                 configured:
 *                   type: boolean
 *                   example: true
 *       503:
 *         description: 네이버 API 설정 누락
 */
router.get('/health', (req, res) => {
  const configured = !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);

  res.status(configured ? 200 : 503).json({
    success: configured,
    service: 'naver-api',
    status: configured ? 'healthy' : 'misconfigured',
    configured,
    timestamp: new Date().toISOString()
  });
});

/**
 * @swagger
 * /api/v1/naver/diagnose:
 *   get:
 *     summary: 네이버 API 상세 진단
 *     description: 네이버 클라우드 플랫폼 API 키 유효성을 실제 API 호출로 검증합니다.
 *     tags: [Naver API]
 *     responses:
 *       200:
 *         description: API 키 검증 성공
 *       503:
 *         description: API 키 검증 실패 또는 설정 문제
 */
router.get('/diagnose', async (req, res) => {
  const requestId = req.headers['x-request-id'] || 'unknown';

  logger.info('Naver API diagnosis requested', { requestId });

  try {
    const validation = await validateNaverApiCredentials(
      process.env.NAVER_CLIENT_ID,
      process.env.NAVER_CLIENT_SECRET
    );

    if (validation.isValid) {
      res.json({
        success: true,
        service: 'naver-api',
        status: 'valid',
        message: '네이버 API 키가 정상적으로 작동합니다',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        success: false,
        service: 'naver-api',
        status: 'invalid',
        error: validation.errorType,
        message: validation.errorMessage,
        suggestion: validation.suggestion,
        setupGuide: process.env.NODE_ENV === 'development' ? getNaverApiSetupGuide() : undefined,
        fallback: {
          available: true,
          endpoint: '/api/v1/naver/reverse-geocode-test',
          description: '테스트용 Mock 데이터 제공'
        },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Naver API diagnosis failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      service: 'naver-api',
      status: 'error',
      message: '진단 프로세스 중 오류가 발생했습니다',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     AutocompleteRequest:
 *       type: object
 *       required:
 *         - query
 *       properties:
 *         query:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *           description: 검색어 (최소 2글자)
 *           example: "강남대로"
 *         limit:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *           default: 5
 *           description: 검색 결과 개수
 *           example: 5
 *
 *     AddressSuggestion:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: 고유 식별자
 *           example: "1270261093_375010898_0"
 *         title:
 *           type: string
 *           description: 장소명/업체명
 *           example: "강남대로"
 *         address:
 *           type: string
 *           description: 지번 주소
 *           example: "서울특별시 서초구 서초동"
 *         roadAddress:
 *           type: string
 *           description: 도로명 주소
 *           example: ""
 *         category:
 *           type: string
 *           description: 카테고리
 *           example: "도로시설>도로명칭"
 *         coordinates:
 *           type: object
 *           properties:
 *             lat:
 *               type: number
 *               description: 위도 (WGS84)
 *               example: 37.501089
 *             lng:
 *               type: number
 *               description: 경도 (WGS84)
 *               example: 127.026109
 *
 *     AutocompleteResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: 요청 성공 여부
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/AddressSuggestion'
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: 응답 시간
 */

/**
 * @swagger
 * /api/v1/naver/autocomplete:
 *   post:
 *     summary: 주소 자동완성 검색
 *     description: 검색어를 입력하면 관련된 주소 및 장소 목록을 반환합니다. 네이버 Local Search API를 활용합니다.
 *     tags: [Naver API]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AutocompleteRequest'
 *     responses:
 *       200:
 *         description: 성공적으로 자동완성 결과를 조회했습니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AutocompleteResponse'
 *       400:
 *         description: 잘못된 요청 (검색어 길이 등)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Bad Request"
 *                 message:
 *                   type: string
 *                   example: "검색어는 최소 2글자 이상이어야 합니다"
 *       500:
 *         description: 서버 내부 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Internal Server Error"
 *                 message:
 *                   type: string
 *                   example: "네이버 API 호출 중 오류가 발생했습니다"
 */
router.post('/autocomplete', async (req, res) => {
  const requestId = req.headers['x-request-id'] || 'unknown';

  try {
    // 요청 데이터 검증
    const validationResult = autocompleteRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      logger.warn('자동완성 요청 검증 실패', {
        requestId,
        errors: validationResult.error.errors,
        body: req.body
      });

      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: validationResult.error.errors[0]?.message || '잘못된 요청입니다',
        timestamp: new Date().toISOString()
      });
    }

    const { query, limit } = validationResult.data;

    logger.info('자동완성 검색 요청', {
      requestId,
      query,
      limit,
      userAgent: req.headers['user-agent']
    });

    // 네이버 Local Search API 호출
    const suggestions = await naverSearchService.searchLocal(query, {
      display: limit,
      sort: 'random'
    });

    logger.info('자동완성 검색 성공', {
      requestId,
      query,
      resultCount: suggestions.length
    });

    res.json({
      success: true,
      data: suggestions,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('자동완성 검색 실패', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body
    });

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : '자동완성 검색 중 오류가 발생했습니다',
      timestamp: new Date().toISOString()
    });
  }
});


export { router as naverRouter };