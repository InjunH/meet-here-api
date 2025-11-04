/**
 * @fileoverview 네이버 클라우드 플랫폼 API 프록시 라우터
 * Reverse Geocoding API를 프록시로 제공하여 CORS 문제 해결
 */

import express from "express";
import { z } from "zod";
import { logger } from "@/utils/logger.js";
import {
  validateNaverApiCredentials,
  getNaverApiSetupGuide,
} from "@/utils/naver-api-validator.js";
import { naverSearchService } from "@/services/naver-search.service.js";
import { naverCloudClient } from "@/lib/api-clients.js";
import { apiConfig, serverConfig } from "@/config/index.js";
import { AppError } from "@/middleware/errorHandler.js";

const router = express.Router();

// Reverse Geocoding 요청 스키마
const reverseGeocodeRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// 자동완성 요청 스키마
const autocompleteRequestSchema = z.object({
  query: z
    .string()
    .min(2, "검색어는 최소 2글자 이상이어야 합니다")
    .max(100, "검색어는 100글자를 초과할 수 없습니다"),
  limit: z.number().min(1).max(5).optional().default(5),
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
router.post("/reverse-geocode", async (req, res) => {
  const requestId = req.headers["x-request-id"] || "unknown";

  try {
    // 요청 데이터 검증
    const validationResult = reverseGeocodeRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      logger.warn("Reverse geocoding validation failed", {
        requestId,
        errors: validationResult.error.errors,
        body: req.body,
      });

      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message:
          validationResult.error.errors[0]?.message || "잘못된 요청입니다",
        timestamp: new Date().toISOString(),
      });
    }

    const { lat, lng } = validationResult.data;

    // 환경변수 확인
    const clientId = apiConfig.naver.cloud.clientId;
    const clientSecret = apiConfig.naver.cloud.clientSecret;

    if (!clientId || !clientSecret) {
      logger.error("Naver API credentials not configured", { requestId });
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "네이버 API 인증 정보가 설정되지 않았습니다",
        timestamp: new Date().toISOString(),
      });
    }

    logger.info("Reverse geocoding request", {
      requestId,
      lat,
      lng,
      userAgent: req.headers["user-agent"],
    });

    // 네이버 클라우드 플랫폼 Reverse Geocoding API 호출
    const coords = `${lng},${lat}`;

    logger.info("Naver Cloud API request details", {
      requestId,
      coords,
      hasCredentials: !!(clientId && clientSecret),
    });

    const naverResponse = await naverCloudClient.reverseGeocode(coords, {
      sourceCrs: "epsg:4326",
      orders: "admcode,legalcode,addr,roadaddr",
      output: "json",
    });

    const responseData = naverResponse.data as NaverReverseGeocodeResponse;

    // API 응답 확인
    if (responseData.status.code !== 0) {
      logger.warn("Naver API returned error", {
        requestId,
        statusCode: responseData.status.code,
        statusMessage: responseData.status.message,
        lat,
        lng,
      });

      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: `좌표 변환 실패: ${responseData.status.message}`,
        timestamp: new Date().toISOString(),
      });
    }

    // 결과 데이터 처리
    const results = naverResponse.data.results;
    if (!results || results.length === 0) {
      logger.warn("No geocoding results found", { requestId, lat, lng });

      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "해당 좌표에 대한 주소를 찾을 수 없습니다",
        timestamp: new Date().toISOString(),
      });
    }

    // 도로명주소와 지번주소 찾기
    const roadAddrResult = results.find(
      (result: any) => result.name === "roadaddr"
    );
    const addrResult = results.find((result: any) => result.name === "addr");

    // 주소 문자열 생성 함수
    const buildAddress = (
      result: (typeof results)[0],
      includeDetails: boolean = true
    ): string => {
      const region = result.region;
      const baseAddress = [
        region.area1?.name, // 시/도
        region.area2?.name, // 시/군/구
        region.area3?.name, // 읍/면/동
      ]
        .filter(Boolean)
        .join(" ");

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
        result.land.addition4?.value,
      ].filter(Boolean);

      return [baseAddress, details.join(""), ...additions]
        .filter(Boolean)
        .join(" ");
    };

    // 행정구역 정보
    const area1 = addrResult?.region.area1?.name || roadAddrResult?.region.area1?.name || "";
    const area2 = addrResult?.region.area2?.name || roadAddrResult?.region.area2?.name || "";
    const area3 = addrResult?.region.area3?.name || roadAddrResult?.region.area3?.name || "";

    const district = [area1, area2, area3]
      .filter(Boolean)
      .join(" ");

    // displayName 생성 (간단한 위치명)
    const createDisplayName = (a1: string, a2: string, a3: string): string => {
      if (a3 && a3.trim()) return `${a3} 근처`;
      if (a2 && a2.trim()) return `${a2} 근처`;
      if (a1 && a1.trim()) return `${a1} 근처`;
      return "위치 확인 중";
    };

    // 응답 데이터 구성
    const result = {
      address: addrResult ? buildAddress(addrResult) : "",
      roadAddress: roadAddrResult ? buildAddress(roadAddrResult) : "",
      district,
      displayName: createDisplayName(area1, area2, area3),
      coordinates: { lat, lng },
    };

    logger.info("Reverse geocoding successful", {
      requestId,
      lat,
      lng,
      hasRoadAddr: !!roadAddrResult,
      hasAddr: !!addrResult,
      district,
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Reverse geocoding failed", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
    });

    // AppError인 경우 상태 코드 확인
    if (error instanceof AppError) {
      const status = error.statusCode || 500;
      const message = error.message;

      logger.error("Naver API Error Details", {
        requestId,
        status,
        message,
        code: (error as any).errorCode || "UNKNOWN_ERROR",
        isOperational: (error as any).isOperational || false,
        metadata: (error as any).metadata || {},
      });

      // 401 에러의 경우 상세한 진단 정보 제공
      if (status === 401) {
        const currentClientId = apiConfig.naver.cloud.clientId;
        const currentClientSecret = apiConfig.naver.cloud.clientSecret;
        const diagnosisMessage =
          `네이버 API 인증 오류 (401): API 키 확인 필요\n` +
          `- Client ID: ${currentClientId}\n` +
          `- Client Secret: ${currentClientSecret ? "설정됨" : "미설정"}\n` +
          `- 가능한 원인: 1) API 키가 잘못되었음 2) 네이버 클라우드 플랫폼에서 서비스가 활성화되지 않음 3) 도메인 제한 설정 문제\n` +
          `- 대안: /api/v1/naver/reverse-geocode-test 엔드포인트 사용 (Mock 데이터)`;

        return res.status(503).json({
          success: false,
          error: "Service Unavailable",
          message: diagnosisMessage,
          fallback: {
            available: true,
            endpoint: "/api/v1/naver/reverse-geocode-test",
            description: "테스트용 Mock 데이터 제공",
          },
          timestamp: new Date().toISOString(),
        });
      }

      return res.status(status).json({
        success: false,
        error: status >= 500 ? "Internal Server Error" : "Bad Request",
        message: `네이버 API 호출 실패: ${message}`,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "역지오코딩 처리 중 오류가 발생했습니다",
      timestamp: new Date().toISOString(),
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
router.get("/health", (req, res) => {
  const configured = !!(
    apiConfig.naver.cloud.clientId && apiConfig.naver.cloud.clientSecret
  );

  res.status(configured ? 200 : 503).json({
    success: configured,
    service: "naver-api",
    status: configured ? "healthy" : "misconfigured",
    configured,
    timestamp: new Date().toISOString(),
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
router.get("/diagnose", async (req, res) => {
  const requestId = req.headers["x-request-id"] || "unknown";

  logger.info("Naver API diagnosis requested", { requestId });

  try {
    const validation = await validateNaverApiCredentials(
      apiConfig.naver.cloud.clientId,
      apiConfig.naver.cloud.clientSecret
    );

    if (validation.isValid) {
      res.json({
        success: true,
        service: "naver-api",
        status: "valid",
        message: "네이버 API 키가 정상적으로 작동합니다",
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        success: false,
        service: "naver-api",
        status: "invalid",
        error: validation.errorType,
        message: validation.errorMessage,
        suggestion: validation.suggestion,
        setupGuide: serverConfig.isDevelopment
          ? getNaverApiSetupGuide()
          : undefined,
        fallback: {
          available: true,
          endpoint: "/api/v1/naver/reverse-geocode-test",
          description: "테스트용 Mock 데이터 제공",
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error("Naver API diagnosis failed", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    res.status(500).json({
      success: false,
      service: "naver-api",
      status: "error",
      message: "진단 프로세스 중 오류가 발생했습니다",
      timestamp: new Date().toISOString(),
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

// 주변 장소 검색 요청 스키마
const nearbyPlacesRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  query: z.string().min(1, "검색 카테고리는 필수입니다").max(100),
  start: z.number().min(1).max(1000).optional().default(1),
  display: z.number().min(1).max(5).optional().default(5),
});

/**
 * @swagger
 * components:
 *   schemas:
 *     NearbyPlacesRequest:
 *       type: object
 *       required:
 *         - lat
 *         - lng
 *         - query
 *       properties:
 *         lat:
 *           type: number
 *           minimum: -90
 *           maximum: 90
 *           description: 중간지점 위도
 *           example: 37.5013
 *         lng:
 *           type: number
 *           minimum: -180
 *           maximum: 180
 *           description: 중간지점 경도
 *           example: 127.0261
 *         query:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: 검색 카테고리 (예 - 카페, 음식점, 스터디카페)
 *           example: "카페"
 *         start:
 *           type: number
 *           minimum: 1
 *           maximum: 1000
 *           default: 1
 *           description: 페이지네이션 시작 위치
 *           example: 1
 *         display:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *           default: 5
 *           description: 결과 개수 (최대 5)
 *           example: 5
 *
 *     PlaceItem:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           description: 장소명 (HTML 태그 제거됨)
 *           example: "스타벅스 강남역점"
 *         address:
 *           type: string
 *           description: 지번 주소
 *           example: "서울특별시 강남구 역삼동 123-45"
 *         roadAddress:
 *           type: string
 *           description: 도로명 주소
 *           example: "서울특별시 강남구 강남대로 123"
 *         category:
 *           type: string
 *           description: 카테고리
 *           example: "음식점>카페,디저트"
 *         mapx:
 *           type: number
 *           description: 경도 (WGS84)
 *           example: 127.027619
 *         mapy:
 *           type: number
 *           description: 위도 (WGS84)
 *           example: 37.498095
 *
 *     NearbyPlacesResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: 요청 성공 여부
 *         data:
 *           type: object
 *           properties:
 *             places:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PlaceItem'
 *             totalCount:
 *               type: number
 *               description: 전체 결과 수
 *               example: 100
 *             start:
 *               type: number
 *               description: 현재 시작 위치
 *               example: 1
 *             hasMore:
 *               type: boolean
 *               description: 다음 페이지 존재 여부
 *               example: true
 *         message:
 *           type: string
 *           description: 추가 메시지
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: 응답 시간
 */

/**
 * @swagger
 * /api/v1/naver/nearby-places:
 *   post:
 *     summary: 중간지점 주변 장소 검색
 *     description: 중간지점 좌표를 기반으로 주변의 카페, 음식점 등 장소를 검색합니다. 네이버 Local Search API를 활용합니다.
 *     tags: [Naver API]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NearbyPlacesRequest'
 *     responses:
 *       200:
 *         description: 성공적으로 주변 장소를 조회했습니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NearbyPlacesResponse'
 *       400:
 *         description: 잘못된 요청 (좌표 형식 오류, 카테고리 누락 등)
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
 *                   example: "검색 카테고리는 필수입니다"
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
 *                   example: "장소 검색 중 오류가 발생했습니다"
 */
router.post("/nearby-places", async (req, res) => {
  const requestId = req.headers["x-request-id"] || "unknown";

  try {
    // 요청 데이터 검증
    const validationResult = nearbyPlacesRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      logger.warn("주변 장소 검색 요청 검증 실패", {
        requestId,
        errors: validationResult.error.errors,
        body: req.body,
      });

      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message:
          validationResult.error.errors[0]?.message || "잘못된 요청입니다",
        timestamp: new Date().toISOString(),
      });
    }

    const { lat, lng, query, start, display } = validationResult.data;

    logger.info("주변 장소 검색 요청", {
      requestId,
      lat,
      lng,
      query,
      start,
      display,
      userAgent: req.headers["user-agent"],
    });

    // 환경변수 확인
    const clientId = apiConfig.naver.search.clientId;
    const clientSecret = apiConfig.naver.search.clientSecret;

    if (!clientId || !clientSecret) {
      logger.error("Naver Search API credentials not configured", {
        requestId,
      });
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "네이버 검색 API 인증 정보가 설정되지 않았습니다",
        timestamp: new Date().toISOString(),
      });
    }

    // 1단계: Reverse Geocoding으로 지역명 가져오기
    let areaName = "";
    try {
      const coords = `${lng},${lat}`;
      const reverseGeocodeResponse = await naverCloudClient.reverseGeocode(
        coords,
        {
          sourceCrs: "epsg:4326",
          orders: "addr",
          output: "json",
        }
      );

      const geocodeData =
        reverseGeocodeResponse.data as NaverReverseGeocodeResponse;

      if (geocodeData.status.code === 0 && geocodeData.results.length > 0) {
        const addrResult = geocodeData.results.find(
          (r) => r.name === "addr"
        );
        if (addrResult) {
          // area3 (동/읍/면) 우선, 없으면 area2 (구/군) 사용
          areaName =
            addrResult.region.area3?.name ||
            addrResult.region.area2?.name ||
            "";
        }
      }

      logger.info("Reverse Geocoding 결과", {
        requestId,
        areaName,
        hasArea: !!areaName,
      });
    } catch (reverseError) {
      logger.warn("Reverse Geocoding 실패 - 카테고리만으로 검색 진행", {
        requestId,
        error:
          reverseError instanceof Error
            ? reverseError.message
            : "Unknown error",
      });
      // Reverse Geocoding 실패해도 계속 진행 (카테고리만으로 검색)
    }

    // 2단계: 지역명 + 카테고리로 검색 쿼리 구성
    const searchQuery = areaName ? `${areaName} ${query}` : query;

    logger.info("네이버 Local Search API 호출", {
      requestId,
      searchQuery,
      originalQuery: query,
      areaName,
      display,
      start,
    });

    // 3단계: 네이버 Local Search API 호출
    const searchResults = await naverSearchService.searchLocal(searchQuery, {
      display,
      start,
      sort: "random",
    });

    logger.info("주변 장소 검색 성공", {
      requestId,
      resultCount: searchResults.length,
      searchQuery,
    });

    // 4단계: 응답 데이터 구성
    const places = searchResults.map((item) => ({
      title: item.title,
      address: item.address,
      roadAddress: item.roadAddress,
      category: item.category,
      mapx: item.coordinates.lng,
      mapy: item.coordinates.lat,
    }));

    // 페이지네이션 정보 계산
    const totalCount = places.length > 0 ? 100 : 0; // 네이버 API는 총 개수를 정확히 제공하지 않으므로 추정값 사용
    const hasMore = places.length === display && start + display <= 1000;

    res.json({
      success: true,
      data: {
        places,
        totalCount,
        start,
        hasMore,
      },
      message: places.length === 0 ? "검색 결과가 없습니다" : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("주변 장소 검색 실패", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
    });

    // AppError인 경우 상태 코드 확인
    if (error instanceof AppError) {
      const status = error.statusCode || 500;
      const message = error.message;

      logger.error("Naver Search API Error Details", {
        requestId,
        status,
        message,
        code: (error as any).errorCode || "UNKNOWN_ERROR",
      });

      return res.status(status).json({
        success: false,
        error: status >= 500 ? "Internal Server Error" : "Bad Request",
        message: `장소 검색 실패: ${message}`,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "장소 검색 중 오류가 발생했습니다",
      timestamp: new Date().toISOString(),
    });
  }
});

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
router.post("/autocomplete", async (req, res) => {
  const requestId = req.headers["x-request-id"] || "unknown";

  try {
    // 요청 데이터 검증
    const validationResult = autocompleteRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      logger.warn("자동완성 요청 검증 실패", {
        requestId,
        errors: validationResult.error.errors,
        body: req.body,
      });

      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message:
          validationResult.error.errors[0]?.message || "잘못된 요청입니다",
        timestamp: new Date().toISOString(),
      });
    }

    const { query, limit } = validationResult.data;

    logger.info("자동완성 검색 요청", {
      requestId,
      query,
      limit,
      userAgent: req.headers["user-agent"],
    });

    // 네이버 Local Search API 호출
    const suggestions = await naverSearchService.searchLocal(query, {
      display: limit,
      sort: "random",
    });

    logger.info("자동완성 검색 성공", {
      requestId,
      query,
      resultCount: suggestions.length,
    });

    res.json({
      success: true,
      data: suggestions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("자동완성 검색 실패", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
    });

    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message:
        error instanceof Error
          ? error.message
          : "자동완성 검색 중 오류가 발생했습니다",
      timestamp: new Date().toISOString(),
    });
  }
});

export { router as naverRouter };
