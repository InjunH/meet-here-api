import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
// import * as schema from '@client/schema.js'; // TODO: Implement schema import
import { logger } from '@/utils/logger.js';

// Database configuration
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  logger.warn('DATABASE_URL not configured - database features will be limited');
}

// Create postgres client
const client = connectionString ? postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false
}) : null;

// Create drizzle instance
export const db = client ? drizzle(client) : null;

// Test database connection
export async function testDatabaseConnection(): Promise<boolean> {
  if (!db || !client) {
    logger.warn('Database not configured');
    return false;
  }

  try {
    // Simple connection test
    await client`SELECT 1`;
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection failed', {
      error: (error as Error).message
    });
    return false;
  }
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  if (client) {
    await client.end();
    logger.info('Database connection closed');
  }
}

// Handle process termination
process.on('SIGTERM', closeDatabaseConnection);
process.on('SIGINT', closeDatabaseConnection);
