import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

export const HOMEPAGE_CACHE_KEY = 'homepage:v1';

@Injectable()
export class HomepageCacheService {
  private readonly logger = new Logger(HomepageCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async get<T>(): Promise<T | undefined> {
    return this.cache.get<T>(HOMEPAGE_CACHE_KEY);
  }

  async set(value: unknown, ttlMs = 10 * 60 * 1000): Promise<void> {
    await this.cache.set(HOMEPAGE_CACHE_KEY, value, ttlMs);
  }

  async bust(): Promise<void> {
    await this.cache.del(HOMEPAGE_CACHE_KEY);
    this.logger.log('Homepage cache busted');
  }
}
