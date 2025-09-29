/**
 * @fileoverview 기본 Repository 인터페이스
 */

export interface BaseRepository<T, K = string> {
  findById(id: K): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: K, data: Partial<T>): Promise<T>;
  delete(id: K): Promise<void>;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}