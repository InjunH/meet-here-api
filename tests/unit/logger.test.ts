/**
 * @fileoverview Logger 유틸리티 단위 테스트
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('Logger Utility Tests', () => {
  let mockConsole: jest.SpiedFunction<typeof console.log>;

  beforeEach(() => {
    mockConsole = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logger 객체가 모든 필요한 메서드를 가지고 있어야 한다', async () => {
    // 동적 import로 logger 모듈 불러오기
    const { logger } = await import('../../src/utils/logger');

    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('로그 레벨에 따라 적절한 로그가 출력되어야 한다', async () => {
    const { logger } = await import('../../src/utils/logger');

    logger.info('Test info message', { data: 'test' });
    logger.warn('Test warn message');
    logger.error('Test error message');
    logger.debug('Test debug message');

    // 테스트 환경에서는 silent 레벨이므로 실제 출력은 없어야 함
    // 하지만 메서드 호출 자체는 성공해야 함
    expect(mockConsole).not.toHaveBeenCalled();
  });

  it('로그 메시지가 문자열과 객체 모두 처리되어야 한다', async () => {
    const { logger } = await import('../../src/utils/logger');

    const testData = {
      userId: 12345,
      action: 'login',
      timestamp: new Date().toISOString()
    };

    // 에러가 발생하지 않아야 함
    expect(() => {
      logger.info('User action', testData);
      logger.warn('Warning message');
      logger.error('Error occurred', { error: 'test error' });
      logger.debug('Debug info', { requestId: 'req-123' });
    }).not.toThrow();
  });

  it('로그 형식이 일관성 있게 처리되어야 한다', async () => {
    const { logger } = await import('../../src/utils/logger');

    // 다양한 형태의 로그 메시지 테스트
    expect(() => {
      logger.info('Simple string message');
      logger.info('Message with metadata', { key: 'value' });
      logger.info('Message with nested object', {
        user: { id: 1, name: 'test' },
        request: { method: 'POST', url: '/api/test' }
      });
      logger.error('Error with error object', new Error('Test error'));
    }).not.toThrow();
  });

  it('로거 생성 시 환경 설정이 적용되어야 한다', async () => {
    // 환경변수가 테스트 환경으로 설정되어 있는지 확인
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.LOG_LEVEL).toBe('silent');

    const { logger } = await import('../../src/utils/logger');

    // 로거가 성공적으로 생성되어야 함
    expect(logger).toBeDefined();
  });
});