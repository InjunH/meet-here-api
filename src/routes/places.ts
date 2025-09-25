import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '@/middleware/errorHandler.js';
import { kakaoApiLimiter } from '@/middleware/rateLimiter.js';
import { logger } from '@/utils/logger.js';

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

    // TODO: Implement actual Kakao Places API search
    // const places = await searchNearbyPlaces(query);

    // Mock response for now
    const mockPlaces: Place[] = generateMockPlaces(query);

    const response: SearchPlacesResponse = {
      places: mockPlaces,
      pagination: {
        total: mockPlaces.length,
        page: 1,
        limit: query.limit,
        hasMore: false
      },
      searchInfo: {
        center: {
          lat: query.lat,
          lng: query.lng
        },
        radius: query.radius,
        category: query.category
      }
    };

    logger.info('Places search completed', {
      resultCount: mockPlaces.length,
      category: query.category
    });

    res.json({
      success: true,
      data: response,
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

// GET /api/v1/places/categories - Get available place categories
router.get('/categories', asyncHandler(async (req: Request, res: Response) => {
  const categories = [
    {
      code: 'CAFE',
      name: '카페',
      description: '커피전문점, 카페, 디저트전문점',
      icon: '☕'
    },
    {
      code: 'RESTAURANT',
      name: '음식점',
      description: '한식, 중식, 일식, 양식, 기타음식',
      icon: '🍽️'
    },
    {
      code: 'BAR',
      name: '술집',
      description: '펑, 비어바, 노래방, 당구장',
      icon: '🍻'
    },
    {
      code: 'CULTURE',
      name: '문화시설',
      description: '영화관, 공연장, 박물관, 도서관',
      icon: '🎭'
    },
    {
      code: 'SHOPPING',
      name: '쇼핑',
      description: '백화점, 대형마트, 아울렛, 전자상가',
      icon: '🛍️'
    }
  ];

  res.json({
    success: true,
    data: categories,
    message: 'Categories retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

// Utility functions
function generateMockPlaces(query: any): Place[] {
  const categories = {
    CAFE: { name: '카페', places: ['스타벅스', '투썸플레이스', '이디야 커피', '빠사바나', '커피빈'] },
    RESTAURANT: { name: '음식점', places: ['매둥국집', '이탈리아너', '일본집', '중국집', '한식당'] },
    BAR: { name: '술집', places: ['노래방', '맥주집', '와인바', '당구장', '펁'] },
    CULTURE: { name: '문화시설', places: ['영화관', '공연장', '박물관', '도서관', '미술관'] },
    SHOPPING: { name: '쇼핑', places: ['백화점', '마트', '아울렛', '전자상가', '부티크'] }
  };

  const selectedCategory = query.category || 'CAFE';
  const categoryInfo = categories[selectedCategory as keyof typeof categories];

  return categoryInfo.places.map((name, index) => ({
    id: `place_${selectedCategory.toLowerCase()}_${index + 1}`,
    kakaoPlaceId: `${26853371 + index}`,
    name: `${name} 신촌점`,
    category: {
      code: selectedCategory,
      name: categoryInfo.name
    },
    address: `서울 서대문구 신촌로 ${74 + index * 10}`,
    coordinates: {
      lat: query.lat + (Math.random() - 0.5) * 0.01,
      lng: query.lng + (Math.random() - 0.5) * 0.01
    },
    distance: Math.round((Math.random() * query.radius * 0.8) + 50),
    phone: `02-${1522 + index}-${3000 + index}`,
    rating: Number((3.5 + Math.random() * 1.5).toFixed(1)),
    reviewCount: Math.floor(Math.random() * 500) + 50
  })).slice(0, query.limit);
}

export { router as placesRouter };
