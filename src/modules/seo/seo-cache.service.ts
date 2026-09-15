import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

// Bump this if the cached payload's shape ever changes, same reasoning as
// HomepageCacheService's HOMEPAGE_CACHE_KEY — a stale cached payload
// missing a newly-added field would otherwise keep serving the old shape
// for up to its full TTL after deploy.
export const SEO_CACHE_KEY = 'seo:v1';

/**
 * Unlike HomepageCacheService, this isn't split into its own module —
 * nothing outside this module needs to bust it (SEO settings/pages are
 * only ever written through SeoAdminController), so the extra
 * SeoCacheModule indirection HomepageCacheModule exists for (multiple
 * unrelated modules busting the SAME homepage cache) doesn't apply here.
 */
@Injectable()
export class SeoCacheService {
  private readonly logger = new Logger(SeoCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async get<T>(): Promise<T | undefined> {
    return this.cache.get<T>(SEO_CACHE_KEY);
  }

  async set(value: unknown, ttlMs = 10 * 60 * 1000): Promise<void> {
    await this.cache.set(SEO_CACHE_KEY, value, ttlMs);
  }

  async bust(): Promise<void> {
    await this.cache.del(SEO_CACHE_KEY);
    this.logger.log('SEO cache busted');
  }
}
