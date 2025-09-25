import { z } from 'zod';
import { Request } from 'express';

// Common validation schemas
export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
});

export const UUIDSchema = z.string().uuid();

export const MeetingCodeSchema = z.string().regex(/^[A-Z0-9]{6}$/);

export const DeviceIdSchema = z.string().regex(/^[a-zA-Z0-9-_]{8,128}$/);

export const PaginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).optional()
});

// Validation helper functions
export function validateCoordinates(lat: number, lng: number): boolean {
  try {
    CoordinatesSchema.parse({ lat, lng });
    return true;
  } catch {
    return false;
  }
}

export function validateMeetingCode(code: string): boolean {
  try {
    MeetingCodeSchema.parse(code);
    return true;
  } catch {
    return false;
  }
}

export function validateDeviceId(deviceId: string): boolean {
  try {
    DeviceIdSchema.parse(deviceId);
    return true;
  } catch {
    return false;
  }
}

// Extract and validate request metadata
export function extractRequestMetadata(req: Request) {
  return {
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
    requestId: req.headers['x-request-id'] as string,
    deviceId: req.headers['x-device-id'] as string,
    userId: req.headers['x-user-id'] as string,
    timestamp: new Date().toISOString()
  };
}

// Sanitize input strings
export function sanitizeString(input: string, maxLength: number = 255): string {
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>"'&]/g, '');
}

// Validate and parse pagination parameters
export function parsePaginationParams(query: any) {
  const page = parseInt(query.page) || 1;
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  const offset = (page - 1) * limit;

  return {
    page: Math.max(1, page),
    limit: Math.max(1, limit),
    offset: Math.max(0, offset)
  };
}

// Custom validation error class
export class ValidationError extends Error {
  public field: string;
  public code: string;

  constructor(message: string, field: string, code: string = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.code = code;
  }
}

// Validate required environment variables
export function validateEnvironment() {
  const required = [
    'NODE_ENV',
    'PORT'
  ];

  const missing = required.filter(env => !process.env[env]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Warn about optional but recommended variables
  const recommended = [
    'DATABASE_URL',
    'KAKAO_API_KEY',
    'JWT_SECRET'
  ];

  const missingRecommended = recommended.filter(env => !process.env[env]);

  if (missingRecommended.length > 0) {
    console.warn(`⚠️  Missing recommended environment variables: ${missingRecommended.join(', ')}`);
  }
}
