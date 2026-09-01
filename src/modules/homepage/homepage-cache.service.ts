import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

// Bumped to v2 when MediaImageDto grew srcsetAvif/placeholder — a stale
// cached v1 payload would otherwise keep serving the old shape (missing
// those fields) for up to its full TTL after deploy, silently, since a
// missing field doesn't error, it just renders as if the feature isn't
// live. Bump this again any time MediaImageDto's shape changes.
export const HOMEPAGE_CACHE_KEY = 'homepage:v2';

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
