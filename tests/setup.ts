import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock external services for testing
// jest.mock('../src/utils/logger.js', () => ({
//   logger: {
//     info: jest.fn(),
//     warn: jest.fn(),
//     error: jest.fn(),
//     debug: jest.fn()
//   },
//   logRequest: jest.fn(),
//   logResponse: jest.fn(),
//   logError: jest.fn()
// }));

// Increase timeout for async tests
jest.setTimeout(30000);

// Global test setup
beforeAll(async () => {
  // Setup test database, Redis, etc.
});

// Global test cleanup
afterAll(async () => {
  // Cleanup test resources
});

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});