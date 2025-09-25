import { Router, Request, Response } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { asyncHandler, createError } from '@/middleware/errorHandler.js';
import { kakaoApiLimiter } from '@/middleware/rateLimiter.js';
import { logger } from '@/utils/logger.js';

const router = Router();

// Validation schemas
const SearchAddressSchema = z.object({
  query: z.string().min(1).max(200),
  page: z.string().transform((val) => parseInt(val)).pipe(z.number().min(1).max(45)).optional().default('1'),
  size: z.string().transform((val) => parseInt(val)).pipe(z.number().min(1).max(30)).optional().default('10')
});

const SearchKeywordSchema = z.object({
  query: z.string().min(1).max(200),
  x: z.string().transform((val) => parseFloat(val)).pipe(z.number().min(-180).max(180)).optional(),
  y: z.string().transform((val) => parseFloat(val)).pipe(z.number().min(-90).max(90)).optional(),
  radius: z.string().transform((val) => parseInt(val)).pipe(z.number().min(0).max(20000)).optional().default('5000'),
  category_group_code: z.string().optional(),
  page: z.string().transform((val) => parseInt(val)).pipe(z.number().min(1).max(45)).optional().default('1'),
  size: z.string().transform((val) => parseInt(val)).pipe(z.number().min(1).max(15)).optional().default('15')
});

const ReverseGeocodeSchema = z.object({
  x: z.string().transform((val) => parseFloat(val)).pipe(z.number().min(-180).max(180)),
  y: z.string().transform((val) => parseFloat(val)).pipe(z.number().min(-90).max(90))
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

// Kakao API client setup
const kakaoApiKey = process.env.KAKAO_API_KEY;
if (!kakaoApiKey) {
  logger.warn('KAKAO_API_KEY not configured - Kakao API features will be disabled');
}

const kakaoClient = axios.create({
  baseURL: 'https://dapi.kakao.com',
  headers: {
    'Authorization': `KakaoAK ${kakaoApiKey}`,
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

// GET /api/v1/kakao/search/address - Search address
router.get('/search/address', kakaoApiLimiter, asyncHandler(async (req: Request, res: Response) => {
  if (!kakaoApiKey) {
    throw createError.serviceUnavailable('Kakao API not configured');
  }

  const query = SearchAddressSchema.parse(req.query);

  try {
    logger.info('Searching address via Kakao API', {
      query: query.query,
      page: query.page,
      size: query.size
    });

    const response = await kakaoClient.get<KakaoApiResponse<AddressDocument>>('/v2/local/search/address.json', {
      params: {
        query: query.query,
        page: query.page,
        size: query.size
      }
    });

    const addresses = response.data.documents.map(doc => ({
      address: doc.address_name,
      roadAddress: doc.road_address?.address_name,
      coordinates: {
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x)
      },
      region: {
        depth1: doc.address.region_1depth_name,
        depth2: doc.address.region_2depth_name,
        depth3: doc.address.region_3depth_name
      }
    }));

    logger.info('Address search completed', {
      resultCount: addresses.length,
      totalCount: response.data.meta.total_count
    });

    res.json({
      success: true,
      data: {
        addresses,
        pagination: {
          total: response.data.meta.total_count,
          page: query.page,
          size: query.size,
          hasMore: !response.data.meta.is_end
        }
      },
      message: 'Address search completed successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error('Kakao API address search failed', {
        status: error.response?.status,
        message: error.response?.data,
        query: query.query
      });

      if (error.response?.status === 401) {
        throw createError.unauthorized('Invalid Kakao API key');
      }
      if (error.response?.status === 429) {
        throw createError.tooManyRequests('Kakao API rate limit exceeded');
      }
    }

    logger.error('Address search error', {
      error: (error as Error).message,
      query: query.query
    });
    throw createError.internal('Address search failed');
  }
}));

// GET /api/v1/kakao/search/keyword - Search places by keyword
router.get('/search/keyword', kakaoApiLimiter, asyncHandler(async (req: Request, res: Response) => {
  if (!kakaoApiKey) {
    throw createError.serviceUnavailable('Kakao API not configured');
  }

  const query = SearchKeywordSchema.parse(req.query);

  try {
    logger.info('Searching places by keyword via Kakao API', {
      query: query.query,
      center: query.x && query.y ? { lat: query.y, lng: query.x } : null,
      radius: query.radius,
      category: query.category_group_code
    });

    const params: any = {
      query: query.query,
      page: query.page,
      size: query.size,
      radius: query.radius
    };

    if (query.x && query.y) {
      params.x = query.x;
      params.y = query.y;
    }

    if (query.category_group_code) {
      params.category_group_code = query.category_group_code;
    }

    const response = await kakaoClient.get<KakaoApiResponse<PlaceDocument>>('/v2/local/search/keyword.json', {
      params
    });

    const places = response.data.documents.map(doc => ({
      id: doc.id,
      name: doc.place_name,
      category: {
        name: doc.category_name,
        groupCode: doc.category_group_code,
        groupName: doc.category_group_name
      },
      address: doc.address_name,
      roadAddress: doc.road_address_name,
      coordinates: {
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x)
      },
      phone: doc.phone,
      url: doc.place_url,
      distance: doc.distance ? parseInt(doc.distance) : null
    }));

    logger.info('Keyword search completed', {
      resultCount: places.length,
      totalCount: response.data.meta.total_count
    });

    res.json({
      success: true,
      data: {
        places,
        pagination: {
          total: response.data.meta.total_count,
          page: query.page,
          size: query.size,
          hasMore: !response.data.meta.is_end
        }
      },
      message: 'Keyword search completed successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error('Kakao API keyword search failed', {
        status: error.response?.status,
        message: error.response?.data,
        query: query.query
      });

      if (error.response?.status === 401) {
        throw createError.unauthorized('Invalid Kakao API key');
      }
      if (error.response?.status === 429) {
        throw createError.tooManyRequests('Kakao API rate limit exceeded');
      }
    }

    logger.error('Keyword search error', {
      error: (error as Error).message,
      query: query.query
    });
    throw createError.internal('Keyword search failed');
  }
}));

// GET /api/v1/kakao/coord2address - Reverse geocoding (coordinates to address)
router.get('/coord2address', kakaoApiLimiter, asyncHandler(async (req: Request, res: Response) => {
  if (!kakaoApiKey) {
    throw createError.serviceUnavailable('Kakao API not configured');
  }

  const query = ReverseGeocodeSchema.parse(req.query);

  try {
    logger.info('Reverse geocoding via Kakao API', {
      coordinates: { lat: query.y, lng: query.x }
    });

    const response = await kakaoClient.get<KakaoApiResponse<AddressDocument>>('/v2/local/geo/coord2address.json', {
      params: {
        x: query.x,
        y: query.y,
        input_coord: 'WGS84'
      }
    });

    if (response.data.documents.length === 0) {
      throw createError.notFound('No address found for the given coordinates');
    }

    const doc = response.data.documents[0];
    const addressInfo = {
      address: doc.address_name,
      roadAddress: doc.road_address?.address_name,
      coordinates: {
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x)
      },
      region: {
        depth1: doc.address.region_1depth_name,
        depth2: doc.address.region_2depth_name,
        depth3: doc.address.region_3depth_name
      }
    };

    logger.info('Reverse geocoding completed', {
      address: addressInfo.address
    });

    res.json({
      success: true,
      data: addressInfo,
      message: 'Reverse geocoding completed successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error('Kakao API reverse geocoding failed', {
        status: error.response?.status,
        message: error.response?.data,
        coordinates: { lat: query.y, lng: query.x }
      });

      if (error.response?.status === 401) {
        throw createError.unauthorized('Invalid Kakao API key');
      }
      if (error.response?.status === 429) {
        throw createError.tooManyRequests('Kakao API rate limit exceeded');
      }
    }

    logger.error('Reverse geocoding error', {
      error: (error as Error).message,
      coordinates: { lat: query.y, lng: query.x }
    });
    throw createError.internal('Reverse geocoding failed');
  }
}));

// GET /api/v1/kakao/category-codes - Get Kakao category codes reference
router.get('/category-codes', asyncHandler(async (req: Request, res: Response) => {
  const categoryCodes = {
    'MT1': '대형마트',
    'CS2': '편의점',
    'PS3': '어린이집, 유치원, 학원',
    'SC4': '학교',
    'AC5': '학원',
    'PK6': '주차장',
    'OL7': '주유소, 충전소',
    'SW8': '지하철역',
    'BK9': '은행',
    'CT1': '문화시설',
    'AG2': '중개업소',
    'PO3': '공공기관',
    'AT4': '관광명소',
    'AD5': '숙박',
    'FD6': '음식점',
    'CE7': '카페',
    'HP8': '병원',
    'PM9': '약국'
  };

  res.json({
    success: true,
    data: {
      categoryCodes,
      description: 'Kakao Maps API category group codes for place search'
    },
    message: 'Category codes retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

export { router as kakaoRouter };
