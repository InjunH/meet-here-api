import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  asyncHandler,
  createError,
  AppError,
} from "@/middleware/errorHandler.js";
import { kakaoApiLimiter } from "@/middleware/rateLimiter.js";
import { logger } from "@/utils/logger.js";
import { kakaoApiClient } from "@/lib/api-clients.js";

const router = Router();

// Validation schemas
const SearchAddressSchema = z.object({
  query: z.string().min(1).max(200),
  page: z
    .string()
    .transform((val) => parseInt(val))
    .pipe(z.number().min(1).max(45))
    .optional()
    .default("1"),
  size: z
    .string()
    .transform((val) => parseInt(val))
    .pipe(z.number().min(1).max(30))
    .optional()
    .default("10"),
});

const SearchKeywordSchema = z.object({
  query: z.string().min(1).max(200),
  x: z
    .string()
    .transform((val) => parseFloat(val))
    .pipe(z.number().min(-180).max(180))
    .optional(),
  y: z
    .string()
    .transform((val) => parseFloat(val))
    .pipe(z.number().min(-90).max(90))
    .optional(),
  radius: z
    .string()
    .transform((val) => parseInt(val))
    .pipe(z.number().min(0).max(20000))
    .optional()
    .default("5000"),
  category_group_code: z.string().optional(),
  page: z
    .string()
    .transform((val) => parseInt(val))
    .pipe(z.number().min(1).max(45))
    .optional()
    .default("1"),
  size: z
    .string()
    .transform((val) => parseInt(val))
    .pipe(z.number().min(1).max(15))
    .optional()
    .default("15"),
});

const ReverseGeocodeSchema = z.object({
  x: z
    .string()
    .transform((val) => parseFloat(val))
    .pipe(z.number().min(-180).max(180)),
  y: z
    .string()
    .transform((val) => parseFloat(val))
    .pipe(z.number().min(-90).max(90)),
});

// Types
interface KakaoApiResponse<T> {
  documents: T[];
  meta: {
    total_count: number;
    pageable_count: number;
    is_end: boolean;
  };
}

interface AddressDocument {
  address_name: string;
  x: string;
  y: string;
  address: {
    address_name: string;
    region_1depth_name: string;
    region_2depth_name: string;
    region_3depth_name: string;
  };
  road_address?: {
    address_name: string;
    region_1depth_name: string;
    region_2depth_name: string;
    region_3depth_name: string;
    road_name: string;
    main_building_no: string;
    sub_building_no: string;
  };
}

interface PlaceDocument {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  category_group_name: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
  place_url: string;
  distance: string;
}

// Kakao API configuration check
const kakaoApiKey = process.env.KAKAO_API_KEY;
if (!kakaoApiKey) {
  logger.warn(
    "KAKAO_API_KEY not configured - Kakao API features will be disabled"
  );
}

/**
 * @swagger
 * /api/v1/kakao/search/address:
 *   get:
 *     summary: 주소 검색 (카카오 API)
 *     description: 카카오 Maps API를 사용하여 주소를 검색합니다.
 *     tags: [Kakao]
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         description: 검색할 주소 문자열
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 200
 *           example: "서울특별시 강남구 강남대로"
 *       - in: query
 *         name: page
 *         required: false
 *         description: 결과 페이지 번호
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 45
 *           default: 1
 *           example: 1
 *       - in: query
 *         name: size
 *         required: false
 *         description: 페이지당 결과 수
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 30
 *           default: 10
 *           example: 10
 *     responses:
 *       200:
 *         description: 주소 검색 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     addresses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           address:
 *                             type: string
 *                             description: 지번 주소
 *                             example: "서울 강남구 역삼동 123-45"
 *                           roadAddress:
 *                             type: string
 *                             description: 도로명 주소
 *                             example: "서울 강남구 강남대로 123"
 *                           coordinates:
 *                             $ref: '#/components/schemas/Location'
 *                           region:
 *                             type: object
 *                             properties:
 *                               depth1:
 *                                 type: string
 *                                 example: "서울"
 *                               depth2:
 *                                 type: string
 *                                 example: "강남구"
 *                               depth3:
 *                                 type: string
 *                                 example: "역삼동"
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         size:
 *                           type: integer
 *                         hasMore:
 *                           type: boolean
 *                 message:
 *                   type: string
 *                   example: "Address search completed successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: 잘못된 카카오 API 키
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: API 요청 한도 초과
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: 카카오 API 설정되지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// GET /api/v1/kakao/search/address - Search address
router.get(
  "/search/address",
  kakaoApiLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    if (!kakaoApiKey) {
      throw createError.serviceUnavailable("Kakao API not configured");
    }

    const query = SearchAddressSchema.parse(req.query);

    try {
      logger.info("Searching address via Kakao API", {
        query: query.query,
        page: query.page,
        size: query.size,
      });

      const response = await kakaoApiClient.address2Coord(
        query.query,
        undefined,
        query.page,
        query.size
      );

      const addresses = response.data.documents.map((doc: any) => ({
        address: doc.address_name,
        roadAddress: doc.road_address?.address_name,
        coordinates: {
          lat: parseFloat(doc.y),
          lng: parseFloat(doc.x),
        },
        region: {
          depth1: doc.address.region_1depth_name,
          depth2: doc.address.region_2depth_name,
          depth3: doc.address.region_3depth_name,
        },
      }));

      logger.info("Address search completed", {
        resultCount: addresses.length,
        totalCount: response.data.meta.total_count,
      });

      res.json({
        success: true,
        data: {
          addresses,
          pagination: {
            total: response.data.meta.total_count,
            page: query.page,
            size: query.size,
            hasMore: !response.data.meta.is_end,
          },
        },
        message: "Address search completed successfully",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        logger.error("Kakao API address search failed", {
          status: error.statusCode,
          message: error.message,
          query: query.query,
        });

        if (error.statusCode === 401) {
          throw createError.unauthorized("Invalid Kakao API key");
        }
        if (error.statusCode === 429) {
          throw createError.tooManyRequests("Kakao API rate limit exceeded");
        }
      }

      logger.error("Address search error", {
        error: (error as Error).message,
        query: query.query,
      });
      throw createError.internal("Address search failed");
    }
  })
);

/**
 * @swagger
 * /api/v1/kakao/search/keyword:
 *   get:
 *     summary: 키워드로 장소 검색 (카카오 API)
 *     description: 카카오 Maps API를 사용하여 키워드로 장소를 검색합니다.
 *     tags: [Kakao]
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         description: 검색할 키워드
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 200
 *           example: "스타벅스"
 *       - in: query
 *         name: x
 *         required: false
 *         description: 검색 중심점 경도
 *         schema:
 *           type: number
 *           format: double
 *           minimum: -180
 *           maximum: 180
 *           example: 127.0276
 *       - in: query
 *         name: y
 *         required: false
 *         description: 검색 중심점 위도
 *         schema:
 *           type: number
 *           format: double
 *           minimum: -90
 *           maximum: 90
 *           example: 37.4979
 *       - in: query
 *         name: radius
 *         required: false
 *         description: 검색 반경 (미터)
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 20000
 *           default: 5000
 *           example: 5000
 *       - in: query
 *         name: category_group_code
 *         required: false
 *         description: "카테고리 그룹 코드 (예: CE7=카페, FD6=음식점)"
 *         schema:
 *           type: string
 *           example: "CE7"
 *       - in: query
 *         name: page
 *         required: false
 *         description: 결과 페이지 번호
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 45
 *           default: 1
 *           example: 1
 *       - in: query
 *         name: size
 *         required: false
 *         description: 페이지당 결과 수
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 15
 *           default: 15
 *           example: 15
 *     responses:
 *       200:
 *         description: 키워드 검색 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     places:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             description: 카카오 장소 ID
 *                             example: "26853371"
 *                           name:
 *                             type: string
 *                             description: 장소명
 *                             example: "스타벅스 강남역점"
 *                           category:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                                 example: "음식점 > 카페 > 커피전문점"
 *                               groupCode:
 *                                 type: string
 *                                 example: "CE7"
 *                               groupName:
 *                                 type: string
 *                                 example: "카페"
 *                           address:
 *                             type: string
 *                             description: 지번 주소
 *                             example: "서울 강남구 역삼동 123-45"
 *                           roadAddress:
 *                             type: string
 *                             description: 도로명 주소
 *                             example: "서울 강남구 강남대로 123"
 *                           coordinates:
 *                             $ref: '#/components/schemas/Location'
 *                           phone:
 *                             type: string
 *                             description: 전화번호
 *                             example: "02-1522-3232"
 *                           url:
 *                             type: string
 *                             description: 카카오맵 URL
 *                             example: "http://place.map.kakao.com/26853371"
 *                           distance:
 *                             type: integer
 *                             description: 중심점으로부터 거리 (미터)
 *                             example: 150
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         size:
 *                           type: integer
 *                         hasMore:
 *                           type: boolean
 *                 message:
 *                   type: string
 *                   example: "Keyword search completed successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: 잘못된 카카오 API 키
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: API 요청 한도 초과
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: 카카오 API 설정되지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// GET /api/v1/kakao/search/keyword - Search places by keyword
router.get(
  "/search/keyword",
  kakaoApiLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    if (!kakaoApiKey) {
      throw createError.serviceUnavailable("Kakao API not configured");
    }

    const query = SearchKeywordSchema.parse(req.query);

    try {
      logger.info("Searching places by keyword via Kakao API", {
        query: query.query,
        center: query.x && query.y ? { lat: query.y, lng: query.x } : null,
        radius: query.radius,
        category: query.category_group_code,
      });

      const params: any = {
        query: query.query,
        page: query.page,
        size: query.size,
        radius: query.radius,
      };

      if (query.x && query.y) {
        params.x = query.x;
        params.y = query.y;
      }

      if (query.category_group_code) {
        params.category_group_code = query.category_group_code;
      }

      const response = await kakaoApiClient.searchPlaces(query.query, params);

      const places = response.data.documents.map((doc: any) => ({
        id: doc.id,
        name: doc.place_name,
        category: {
          name: doc.category_name,
          groupCode: doc.category_group_code,
          groupName: doc.category_group_name,
        },
        address: doc.address_name,
        roadAddress: doc.road_address_name,
        coordinates: {
          lat: parseFloat(doc.y),
          lng: parseFloat(doc.x),
        },
        phone: doc.phone,
        url: doc.place_url,
        distance: doc.distance ? parseInt(doc.distance) : null,
      }));

      logger.info("Keyword search completed", {
        resultCount: places.length,
        totalCount: response.data.meta.total_count,
      });

      res.json({
        success: true,
        data: {
          places,
          pagination: {
            total: response.data.meta.total_count,
            page: query.page,
            size: query.size,
            hasMore: !response.data.meta.is_end,
          },
        },
        message: "Keyword search completed successfully",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        logger.error("Kakao API keyword search failed", {
          status: error.statusCode,
          message: error.message,
          query: query.query,
        });

        if (error.statusCode === 401) {
          throw createError.unauthorized("Invalid Kakao API key");
        }
        if (error.statusCode === 429) {
          throw createError.tooManyRequests("Kakao API rate limit exceeded");
        }
      }

      logger.error("Keyword search error", {
        error: (error as Error).message,
        query: query.query,
      });
      throw createError.internal("Keyword search failed");
    }
  })
);

/**
 * @swagger
 * /api/v1/kakao/coord2address:
 *   get:
 *     summary: 좌표를 주소로 변환 (역지오코딩)
 *     description: 카카오 Maps API를 사용하여 좌표를 주소로 변환합니다.
 *     tags: [Kakao]
 *     parameters:
 *       - in: query
 *         name: x
 *         required: true
 *         description: 변환할 경도
 *         schema:
 *           type: number
 *           format: double
 *           minimum: -180
 *           maximum: 180
 *           example: 127.0276
 *       - in: query
 *         name: y
 *         required: true
 *         description: 변환할 위도
 *         schema:
 *           type: number
 *           format: double
 *           minimum: -90
 *           maximum: 90
 *           example: 37.4979
 *     responses:
 *       200:
 *         description: 좌표 변환 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                       description: 지번 주소
 *                       example: "서울 강남구 역삼동 123-45"
 *                     roadAddress:
 *                       type: string
 *                       description: 도로명 주소
 *                       example: "서울 강남구 강남대로 123"
 *                     coordinates:
 *                       $ref: '#/components/schemas/Location'
 *                     region:
 *                       type: object
 *                       properties:
 *                         depth1:
 *                           type: string
 *                           example: "서울"
 *                         depth2:
 *                           type: string
 *                           example: "강남구"
 *                         depth3:
 *                           type: string
 *                           example: "역삼동"
 *                 message:
 *                   type: string
 *                   example: "Reverse geocoding completed successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: 잘못된 카카오 API 키
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 좌표에 해당하는 주소를 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: API 요청 한도 초과
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: 카카오 API 설정되지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// GET /api/v1/kakao/coord2address - Reverse geocoding (coordinates to address)
router.get(
  "/coord2address",
  kakaoApiLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    if (!kakaoApiKey) {
      throw createError.serviceUnavailable("Kakao API not configured");
    }

    const query = ReverseGeocodeSchema.parse(req.query);

    try {
      logger.info("Reverse geocoding via Kakao API", {
        coordinates: { lat: query.y, lng: query.x },
      });

      const response = await kakaoApiClient.coord2Address(
        query.x,
        query.y,
        "WGS84"
      );

      if (response.data.documents.length === 0) {
        throw createError.notFound(
          "No address found for the given coordinates"
        );
      }

      const doc = response.data.documents[0];
      const addressInfo = {
        address: doc.address_name,
        roadAddress: doc.road_address?.address_name,
        coordinates: {
          lat: parseFloat(doc.y),
          lng: parseFloat(doc.x),
        },
        region: {
          depth1: doc.address.region_1depth_name,
          depth2: doc.address.region_2depth_name,
          depth3: doc.address.region_3depth_name,
        },
      };

      logger.info("Reverse geocoding completed", {
        address: addressInfo.address,
      });

      res.json({
        success: true,
        data: addressInfo,
        message: "Reverse geocoding completed successfully",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        logger.error("Kakao API reverse geocoding failed", {
          status: error.statusCode,
          message: error.message,
          coordinates: { lat: query.y, lng: query.x },
        });

        if (error.statusCode === 401) {
          throw createError.unauthorized("Invalid Kakao API key");
        }
        if (error.statusCode === 429) {
          throw createError.tooManyRequests("Kakao API rate limit exceeded");
        }
      }

      logger.error("Reverse geocoding error", {
        error: (error as Error).message,
        coordinates: { lat: query.y, lng: query.x },
      });
      throw createError.internal("Reverse geocoding failed");
    }
  })
);

/**
 * @swagger
 * /api/v1/kakao/category-codes:
 *   get:
 *     summary: 카카오 카테고리 코드 목록
 *     description: 카카오 Maps API에서 사용되는 카테고리 그룹 코드 목록을 반환합니다.
 *     tags: [Kakao]
 *     responses:
 *       200:
 *         description: 카테고리 코드 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     categoryCodes:
 *                       type: object
 *                       description: 카테고리 코드와 설명의 매핑
 *                       additionalProperties:
 *                         type: string
 *                       example:
 *                         MT1: "대형마트"
 *                         CS2: "편의점"
 *                         CE7: "카페"
 *                         FD6: "음식점"
 *                         CT1: "문화시설"
 *                     description:
 *                       type: string
 *                       example: "Kakao Maps API category group codes for place search"
 *                 message:
 *                   type: string
 *                   example: "Category codes retrieved successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
// GET /api/v1/kakao/category-codes - Get Kakao category codes reference
router.get(
  "/category-codes",
  asyncHandler(async (req: Request, res: Response) => {
    const categoryCodes = {
      MT1: "대형마트",
      CS2: "편의점",
      PS3: "어린이집, 유치원, 학원",
      SC4: "학교",
      AC5: "학원",
      PK6: "주차장",
      OL7: "주유소, 충전소",
      SW8: "지하철역",
      BK9: "은행",
      CT1: "문화시설",
      AG2: "중개업소",
      PO3: "공공기관",
      AT4: "관광명소",
      AD5: "숙박",
      FD6: "음식점",
      CE7: "카페",
      HP8: "병원",
      PM9: "약국",
    };

    res.json({
      success: true,
      data: {
        categoryCodes,
        description: "Kakao Maps API category group codes for place search",
      },
      message: "Category codes retrieved successfully",
      timestamp: new Date().toISOString(),
    });
  })
);

export { router as kakaoRouter };
