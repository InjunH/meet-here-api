import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '@/middleware/errorHandler.js';
import { kakaoApiLimiter } from '@/middleware/rateLimiter.js';
import { logger } from '@/utils/logger.js';
import { placeSearchService } from '@/services/place-search.service.js';

const router = Router();

// Validation schemas
const SearchPlacesSchema = z.object({
  lat: z.string().transform((val) => parseFloat(val)).pipe(z.number().min(-90).max(90)),
  lng: z.string().transform((val) => parseFloat(val)).pipe(z.number().min(-180).max(180)),
  category: z.enum(['CAFE', 'RESTAURANT', 'BAR', 'CULTURE', 'SHOPPING']).optional(),
  radius: z.string().transform((val) => parseInt(val)).pipe(z.number().min(100).max(5000)).optional().default('1000'),
  limit: z.string().transform((val) => parseInt(val)).pipe(z.number().min(1).max(50)).optional().default('20')
});

const GetPlaceSchema = z.object({
  id: z.string().min(1)
});

// Types
interface Place {
  id: string;
  kakaoPlaceId?: string;
  name: string;
  category: {
    code: string;
    name: string;
  };
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  distance: number;
  phone?: string;
  url?: string;
  businessHours?: Array<{
    day: string;
    open: string;
    close: string;
  }>;
  rating?: number;
  reviewCount?: number;
}

interface SearchPlacesResponse {
  places: Place[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
  searchInfo: {
    center: {
      lat: number;
      lng: number;
    };
    radius: number;
    category?: string;
  };
}

/**
 * @swagger
 * /api/v1/places/search:
 *   get:
 *     summary: 위치 기반 장소 검색
 *     description: 좌표 중심으로 반경 내의 장소들을 카테고리별로 검색합니다.
 *     tags: [Places]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         description: 검색 중심점 위도
 *         schema:
 *           type: number
 *           format: double
 *           minimum: -90
 *           maximum: 90
 *           example: 37.5665
 *       - in: query
 *         name: lng
 *         required: true
 *         description: 검색 중심점 경도
 *         schema:
 *           type: number
 *           format: double
 *           minimum: -180
 *           maximum: 180
 *           example: 126.9780
 *       - in: query
 *         name: category
 *         required: false
 *         description: 검색할 장소 카테고리
 *         schema:
 *           type: string
 *           enum: [CAFE, RESTAURANT, BAR, CULTURE, SHOPPING]
 *           example: CAFE
 *       - in: query
 *         name: radius
 *         required: false
 *         description: 검색 반경 (미터)
 *         schema:
 *           type: integer
 *           minimum: 100
 *           maximum: 5000
 *           default: 1000
 *           example: 1000
 *       - in: query
 *         name: limit
 *         required: false
 *         description: 결과 개수 제한
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *           example: 20
 *     responses:
 *       200:
 *         description: 장소 검색 성공
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
 *                         $ref: '#/components/schemas/Place'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         hasMore:
 *                           type: boolean
 *                     searchInfo:
 *                       type: object
 *                       properties:
 *                         center:
 *                           $ref: '#/components/schemas/Location'
 *                         radius:
 *                           type: integer
 *                         category:
 *                           type: string
 *                 message:
 *                   type: string
 *                   example: "Places retrieved successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: 잘못된 요청 파라미터
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 내부 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// GET /api/v1/places/search - Search places near coordinates
router.get('/search', kakaoApiLimiter, asyncHandler(async (req: Request, res: Response) => {
  const query = SearchPlacesSchema.parse(req.query);

  try {
    logger.info('Searching places', {
      center: { lat: query.lat, lng: query.lng },
      category: query.category,
      radius: query.radius,
      limit: query.limit
    });

    // 실제 카카오 API를 통한 장소 검색
    const result = await placeSearchService.searchNearbyPlaces({
      lat: query.lat,
      lng: query.lng,
      category: query.category,
      radius: query.radius,
      limit: query.limit
    });

    logger.info('Places search completed', {
      resultCount: result.places.length,
      total: result.pagination.total,
      category: query.category
    });

    res.json({
      success: true,
      data: result,
      message: 'Places retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Places search failed', {
      error: (error as Error).message,
      query
    });
    throw createError.internal('Failed to search places');
  }
}));

/**
 * @swagger
 * /api/v1/places/{id}:
 *   get:
 *     summary: 장소 상세 정보 조회
 *     description: 장소 ID를 사용하여 상세 정보를 조회합니다.
 *     tags: [Places]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: 장소 고유 ID
 *         schema:
 *           type: string
 *           example: "place_cafe_1"
 *     responses:
 *       200:
 *         description: 장소 상세 정보 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Place'
 *                 message:
 *                   type: string
 *                   example: "Place details retrieved successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: 장소를 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// GET /api/v1/places/:id - Get place details by ID
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = GetPlaceSchema.parse({ id: req.params.id });

  try {
    logger.info('Fetching place details', { placeId: id });

    // TODO: Implement actual place details fetch
    // const place = await getPlaceDetails(id);

    // Mock response
    const place: Place = {
      id,
      kakaoPlaceId: '26853371',
      name: '스타벅스 신촌점',
      category: {
        code: 'CE7',
        name: '카페'
      },
      address: '서울 서대문구 신촌로 74',
      coordinates: {
        lat: 37.5599,
        lng: 126.9423
      },
      distance: 150,
      phone: '02-1522-3232',
      businessHours: [
        { day: 'MON', open: '07:00', close: '22:00' },
        { day: 'TUE', open: '07:00', close: '22:00' },
        { day: 'WED', open: '07:00', close: '22:00' },
        { day: 'THU', open: '07:00', close: '22:00' },
        { day: 'FRI', open: '07:00', close: '22:00' },
        { day: 'SAT', open: '07:30', close: '21:30' },
        { day: 'SUN', open: '07:30', close: '21:30' }
      ],
      rating: 4.5,
      reviewCount: 234
    };

    res.json({
      success: true,
      data: place,
      message: 'Place details retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to fetch place details', {
      error: (error as Error).message,
      placeId: id
    });
    throw createError.notFound('Place not found');
  }
}));

/**
 * @swagger
 * /api/v1/places/categories:
 *   get:
 *     summary: 사용 가능한 장소 카테고리 목록
 *     description: 검색에 사용할 수 있는 모든 장소 카테고리를 반환합니다.
 *     tags: [Places]
 *     responses:
 *       200:
 *         description: 카테고리 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       code:
 *                         type: string
 *                         description: 카테고리 코드
 *                         example: "CAFE"
 *                       name:
 *                         type: string
 *                         description: 카테고리 이름
 *                         example: "카페"
 *                       description:
 *                         type: string
 *                         description: 카테고리 설명
 *                         example: "커피전문점, 카페, 디저트전문점"
 *                       icon:
 *                         type: string
 *                         description: 카테고리 아이콘
 *                         example: "☕"
 *                 message:
 *                   type: string
 *                   example: "Categories retrieved successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
// GET /api/v1/places/categories - Get available place categories
router.get('/categories', asyncHandler(async (req: Request, res: Response) => {
  const categories = placeSearchService.getAvailableCategories();

  res.json({
    success: true,
    data: categories,
    message: 'Categories retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

export { router as placesRouter };
