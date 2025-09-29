/**
 * @fileoverview 통합 HTTP 클라이언트
 * 외부 API 호출을 위한 추상화된 HTTP 클라이언트 제공
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig
} from 'axios';
import { logger } from '@/utils/logger.js';
import { AppError } from '@/middleware/errorHandler.js';

// HTTP 클라이언트 설정 인터페이스
export interface HttpClientConfig {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
  retryAttempts?: number;
  retryDelay?: number;
}

// 요청 옵션 인터페이스
export interface RequestOptions extends Omit<AxiosRequestConfig, 'url' | 'method'> {
  skipRetry?: boolean;
  logRequest?: boolean;
  logResponse?: boolean;
}

// 응답 타입
export interface ApiResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

// 에러 타입
export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  data?: any;
}

/**
 * 통합 HTTP 클라이언트 클래스
 */
export class HttpClient {
  private client: AxiosInstance;
  private retryAttempts: number;
  private retryDelay: number;

  constructor(config: HttpClientConfig) {
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;

    // Axios 인스턴스 생성
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MeetHere-API/1.0',
        ...config.headers,
      },
    });

    // 요청 인터셉터 설정
    this.client.interceptors.request.use(
      this.handleRequest.bind(this),
      this.handleRequestError.bind(this)
    );

    // 응답 인터셉터 설정
    this.client.interceptors.response.use(
      this.handleResponse.bind(this),
      this.handleResponseError.bind(this)
    );
  }

  /**
   * 요청 인터셉터
   */
  private handleRequest(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    // 요청 ID 추가
    if (!config.headers['X-Request-ID']) {
      config.headers['X-Request-ID'] = this.generateRequestId();
    }

    // 요청 로깅
    if (config.meta?.logRequest !== false) {
      logger.info('HTTP 요청', {
        method: config.method?.toUpperCase(),
        url: `${config.baseURL}${config.url}`,
        requestId: config.headers['X-Request-ID'],
        params: config.params,
        headers: this.sanitizeHeaders(config.headers)
      });
    }

    return config;
  }

  /**
   * 요청 에러 인터셉터
   */
  private handleRequestError(error: AxiosError): Promise<AxiosError> {
    logger.error('HTTP 요청 오류', {
      message: error.message,
      config: error.config
    });

    return Promise.reject(error);
  }

  /**
   * 응답 인터셉터
   */
  private handleResponse(response: AxiosResponse): AxiosResponse {
    // 응답 로깅
    if (response.config.meta?.logResponse !== false) {
      logger.info('HTTP 응답', {
        status: response.status,
        url: `${response.config.baseURL}${response.config.url}`,
        requestId: response.config.headers['X-Request-ID'],
        responseTime: this.getResponseTime(response),
        dataSize: JSON.stringify(response.data).length
      });
    }

    return response;
  }

  /**
   * 응답 에러 인터셉터
   */
  private async handleResponseError(error: AxiosError): Promise<never> {
    const config = error.config as InternalAxiosRequestConfig & { retryCount?: number };

    // 재시도 로직
    if (this.shouldRetry(error) && !config.meta?.skipRetry) {
      config.retryCount = config.retryCount || 0;

      if (config.retryCount < this.retryAttempts) {
        config.retryCount += 1;

        logger.warn('HTTP 요청 재시도', {
          url: `${config.baseURL}${config.url}`,
          attempt: config.retryCount,
          maxAttempts: this.retryAttempts,
          error: error.message
        });

        // 재시도 지연
        await this.delay(this.retryDelay * config.retryCount);

        return this.client.request(config);
      }
    }

    // 에러 로깅
    logger.error('HTTP 응답 오류', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: `${config.baseURL}${config.url}`,
      requestId: config.headers['X-Request-ID'],
      message: error.message,
      responseData: error.response?.data
    });

    throw this.transformError(error);
  }

  /**
   * GET 요청
   */
  async get<T = any>(url: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    // RequestOptions에서 meta 정보 제외하고 axios config 생성
    const { logRequest, logResponse, skipRetry, ...axiosOptions } = options;

    const response = await this.client.get<T>(url, axiosOptions);

    return this.transformResponse(response);
  }

  /**
   * POST 요청
   */
  async post<T = any>(url: string, data?: any, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const { logRequest, logResponse, skipRetry, ...axiosOptions } = options;

    const response = await this.client.post<T>(url, data, axiosOptions);

    return this.transformResponse(response);
  }

  /**
   * PUT 요청
   */
  async put<T = any>(url: string, data?: any, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const { logRequest, logResponse, skipRetry, ...axiosOptions } = options;

    const response = await this.client.put<T>(url, data, axiosOptions);

    return this.transformResponse(response);
  }

  /**
   * DELETE 요청
   */
  async delete<T = any>(url: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const { logRequest, logResponse, skipRetry, ...axiosOptions } = options;

    const response = await this.client.delete<T>(url, axiosOptions);

    return this.transformResponse(response);
  }

  /**
   * PATCH 요청
   */
  async patch<T = any>(url: string, data?: any, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const { logRequest, logResponse, skipRetry, ...axiosOptions } = options;

    const response = await this.client.patch<T>(url, data, axiosOptions);

    return this.transformResponse(response);
  }

  /**
   * 요청 ID 생성
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 민감한 헤더 정보 마스킹
   */
  private sanitizeHeaders(headers: Record<string, any>): Record<string, string> {
    const sensitiveKeys = ['authorization', 'x-ncp-apigw-api-key', 'x-naver-client-secret'];
    const sanitized: Record<string, string> = {};

    Object.entries(headers).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[MASKED]';
      } else {
        sanitized[key] = String(value);
      }
    });

    return sanitized;
  }

  /**
   * 응답 시간 계산
   */
  private getResponseTime(response: AxiosResponse): number {
    const requestTime = response.config.metadata?.startTime;
    return requestTime ? Date.now() - requestTime : 0;
  }

  /**
   * 재시도 여부 판단
   */
  private shouldRetry(error: AxiosError): boolean {
    // 네트워크 오류 또는 5xx 상태 코드에서 재시도
    if (!error.response) {
      return true; // 네트워크 오류
    }

    const status = error.response.status;
    return status >= 500 || status === 429; // 서버 오류 또는 Rate Limit
  }

  /**
   * 지연 함수
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Axios 응답을 API 응답으로 변환
   */
  private transformResponse<T>(response: AxiosResponse<T>): ApiResponse<T> {
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>
    };
  }

  /**
   * Axios 에러를 AppError로 변환
   */
  private transformError(error: AxiosError): AppError {
    if (error.response) {
      // HTTP 응답 에러
      const status = error.response.status;
      const message = this.getErrorMessage(error);

      return new AppError(
        message,
        status,
        this.getErrorCode(status),
        true,
        error.response.data
      );
    } else if (error.request) {
      // 네트워크 에러
      return new AppError(
        '네트워크 연결 오류가 발생했습니다',
        503,
        'NETWORK_ERROR',
        true
      );
    } else {
      // 기타 에러
      return new AppError(
        error.message || '알 수 없는 오류가 발생했습니다',
        500,
        'UNKNOWN_ERROR',
        true
      );
    }
  }

  /**
   * 에러 메시지 추출
   */
  private getErrorMessage(error: AxiosError): string {
    if (error.response?.data && typeof error.response.data === 'object') {
      const data = error.response.data as any;
      return data.message || data.error || data.errorMessage || error.message;
    }

    return error.message;
  }

  /**
   * HTTP 상태 코드에 따른 에러 코드 생성
   */
  private getErrorCode(status: number): string {
    if (status >= 400 && status < 500) {
      return 'CLIENT_ERROR';
    } else if (status >= 500) {
      return 'SERVER_ERROR';
    }

    return 'HTTP_ERROR';
  }
}

// 기본 HTTP 클라이언트 팩토리
export const createHttpClient = (config: HttpClientConfig): HttpClient => {
  return new HttpClient(config);
};

// 타입 확장을 위한 모듈 선언
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    meta?: {
      logRequest?: boolean;
      logResponse?: boolean;
      skipRetry?: boolean;
    };
    retryCount?: number;
    metadata?: {
      startTime?: number;
    };
  }
}