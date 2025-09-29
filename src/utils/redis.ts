import { createClient, RedisClientType } from 'redis';
import { logger } from '@/utils/logger.js';
import { databaseConfig } from '@/config/index.js';

// Redis configuration
const redisUrl = databaseConfig.redis.url;
const isRedisEnabled = databaseConfig.redis.enabled;

// Redis client instance
let redisClient: RedisClientType | null = null;

// Initialize Redis client
export async function initializeRedis(): Promise<RedisClientType | null> {
  if (!isRedisEnabled) {
    logger.info('Redis cache disabled by configuration');
    return null;
  }

  try {
    redisClient = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => Math.min(retries * 50, 500)
      }
    });

    redisClient.on('error', (error) => {
      logger.error('Redis connection error', {
        error: error.message
      });
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('end', () => {
      logger.info('Redis connection ended');
    });

    await redisClient.connect();
    return redisClient;

  } catch (error) {
    logger.error('Failed to initialize Redis', {
      error: (error as Error).message,
      url: redisUrl
    });
    redisClient = null;
    return null;
  }
}

// Get Redis client
export function getRedisClient(): RedisClientType | null {
  return redisClient;
}

// Test Redis connection
export async function testRedisConnection(): Promise<boolean> {
  if (!redisClient) {
    return false;
  }

  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    logger.error('Redis ping failed', {
      error: (error as Error).message
    });
    return false;
  }
}

// Cache helper functions
export class CacheService {
  private client: RedisClientType | null;

  constructor() {
    this.client = getRedisClient();
  }

  // Get value from cache
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.client) {return null;}

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error', {
        key,
        error: (error as Error).message
      });
      return null;
    }
  }

  // Set value in cache
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    if (!this.client) {return false;}

    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setEx(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error('Cache set error', {
        key,
        ttl,
        error: (error as Error).message
      });
      return false;
    }
  }

  // Delete value from cache
  async del(key: string): Promise<boolean> {
    if (!this.client) {return false;}

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error', {
        key,
        error: (error as Error).message
      });
      return false;
    }
  }

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    if (!this.client) {return false;}

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists check error', {
        key,
        error: (error as Error).message
      });
      return false;
    }
  }

  // Increment counter
  async incr(key: string, ttl?: number): Promise<number | null> {
    if (!this.client) {return null;}

    try {
      const result = await this.client.incr(key);
      if (ttl && result === 1) {
        await this.client.expire(key, ttl);
      }
      return result;
    } catch (error) {
      logger.error('Cache increment error', {
        key,
        error: (error as Error).message
      });
      return null;
    }
  }

  // Get hash field
  async hget(key: string, field: string): Promise<string | null> {
    if (!this.client) {return null;}

    try {
      const result = await this.client.hGet(key, field);
      return result || null;
    } catch (error) {
      logger.error('Cache hget error', {
        key,
        field,
        error: (error as Error).message
      });
      return null;
    }
  }

  // Set hash field
  async hset(key: string, field: string, value: string, ttl?: number): Promise<boolean> {
    if (!this.client) {return false;}

    try {
      await this.client.hSet(key, field, value);
      if (ttl) {
        await this.client.expire(key, ttl);
      }
      return true;
    } catch (error) {
      logger.error('Cache hset error', {
        key,
        field,
        error: (error as Error).message
      });
      return false;
    }
  }
}

// Global cache service instance
export const cache = new CacheService();

// Close Redis connection
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.disconnect();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}

// Handle process termination
process.on('SIGTERM', closeRedisConnection);
process.on('SIGINT', closeRedisConnection);
