import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '@/middleware/errorHandler.js';
import { validateDeviceId } from '@/middleware/security.js';
import { logger } from '@/utils/logger.js';

const router = Router();

// Validation schemas
const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
});

const LocationSchema = z.object({
  label: z.string().min(1).max(50),
  address: z.string().min(1).max(200),
  coordinates: CoordinatesSchema
});

const CreateMeetingSchema = z.object({
  participantCount: z.number().min(2).max(10),
  locations: z.array(LocationSchema).min(2).max(10)
});

const GetMeetingByCodeSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/)
});

// Types
interface CreateMeetingRequest {
  participantCount: number;
  locations: Array<{
    label: string;
    address: string;
    coordinates: {
      lat: number;
      lng: number;
    };
  }>;
}

interface MeetingResponse {
  id: string;
  code: string;
  centerPoint: {
    lat: number;
    lng: number;
    address?: string;
  };
  locations: Array<{
    id: string;
    label: string;
    address: string;
    coordinates: {
      lat: number;
      lng: number;
    };
    distanceToCenter?: number;
  }>;
  participantCount: number;
  status: 'DRAFT' | 'ACTIVE' | 'VOTING' | 'COMPLETED' | 'EXPIRED';
  shareLink: string;
  createdAt: string;
  expiresAt: string;
}

// POST /api/v1/meetings - Create new meeting
router.post('/', validateDeviceId, asyncHandler(async (req: Request, res: Response) => {
  const body = CreateMeetingSchema.parse(req.body) as CreateMeetingRequest;
  const deviceId = req.headers['x-device-id'] as string;
  const userAgent = req.headers['user-agent'] as string;
  const ip = req.ip;

  try {
    logger.info('Creating new meeting', {
      participantCount: body.participantCount,
      locationCount: body.locations.length,
      deviceId,
      userAgent,
      ip
    });

    // Calculate center point from locations
    const centerPoint = calculateCenterPoint(body.locations.map(loc => loc.coordinates));

    // Generate unique meeting code
    const meetingCode = generateMeetingCode();
    const meetingId = `meet_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Calculate distances from center for each location
    const locationsWithDistance = body.locations.map((location, index) => ({
      id: `loc_${index + 1}`,
      ...location,
      distanceToCenter: calculateDistance(
        centerPoint,
        location.coordinates
      )
    }));

    // Create meeting response
    const meeting: MeetingResponse = {
      id: meetingId,
      code: meetingCode,
      centerPoint: {
        ...centerPoint,
        address: await getCenterAddress(centerPoint) // Would call Kakao API
      },
      locations: locationsWithDistance,
      participantCount: body.participantCount,
      status: 'ACTIVE',
      shareLink: `${process.env.CLIENT_URL || 'http://localhost:5173'}/m/${meetingCode}`,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    };

    // TODO: Save meeting to database
    // await saveMeeting(meeting, deviceId, { userAgent, ip });

    logger.info('Meeting created successfully', {
      meetingId,
      code: meetingCode,
      centerPoint,
      deviceId
    });

    res.status(201).json({
      success: true,
      data: meeting,
      message: 'Meeting created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to create meeting', {
      error: (error as Error).message,
      deviceId,
      body
    });
    throw createError.internal('Failed to create meeting');
  }
}));

// GET /api/v1/meetings/:id - Get meeting by ID
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const meetingId = req.params.id;

  if (!meetingId || !/^meet_/.test(meetingId)) {
    throw createError.badRequest('Invalid meeting ID format');
  }

  try {
    // TODO: Fetch meeting from database
    // const meeting = await getMeetingById(meetingId);

    // Mock response for now
    const meeting: MeetingResponse = {
      id: meetingId,
      code: 'ABC123',
      centerPoint: {
        lat: 37.5665,
        lng: 126.9780,
        address: '서울특별시 중구 을지로입구역'
      },
      locations: [
        {
          id: 'loc_1',
          label: 'Person A',
          address: '강남역',
          coordinates: { lat: 37.4979, lng: 127.0276 },
          distanceToCenter: 8.2
        }
      ],
      participantCount: 3,
      status: 'ACTIVE',
      shareLink: `${process.env.CLIENT_URL || 'http://localhost:5173'}/m/ABC123`,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    res.json({
      success: true,
      data: meeting,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to fetch meeting', {
      error: (error as Error).message,
      meetingId
    });
    throw createError.notFound('Meeting not found');
  }
}));

// GET /api/v1/meetings/code/:code - Get meeting by code
router.get('/code/:code', asyncHandler(async (req: Request, res: Response) => {
  const { code } = GetMeetingByCodeSchema.parse({ code: req.params.code });

  try {
    // TODO: Fetch meeting by code from database
    // const meeting = await getMeetingByCode(code);

    logger.info('Fetching meeting by code', { code });

    // Mock response - redirect to meeting ID endpoint
    const mockMeetingId = `meet_${Date.now()}`;

    res.json({
      success: true,
      data: {
        id: mockMeetingId,
        code,
        found: true
      },
      message: 'Meeting found',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to fetch meeting by code', {
      error: (error as Error).message,
      code
    });
    throw createError.notFound('Meeting not found');
  }
}));

// Utility functions
function calculateCenterPoint(coordinates: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
  if (coordinates.length === 0) {
    throw new Error('No coordinates provided');
  }

  // Simple centroid calculation
  const totalLat = coordinates.reduce((sum, coord) => sum + coord.lat, 0);
  const totalLng = coordinates.reduce((sum, coord) => sum + coord.lng, 0);

  return {
    lat: Number((totalLat / coordinates.length).toFixed(6)),
    lng: Number((totalLng / coordinates.length).toFixed(6))
  };
}

function calculateDistance(
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number }
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLng = (point2.lng - point1.lng) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Number(distance.toFixed(2));
}

function generateMeetingCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';

  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return result;
}

async function getCenterAddress(coordinates: { lat: number; lng: number }): Promise<string> {
  // TODO: Implement Kakao Maps reverse geocoding
  return `위도 ${coordinates.lat}, 경도 ${coordinates.lng} 근처`;
}

export { router as meetingsRouter };
