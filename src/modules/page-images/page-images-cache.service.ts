import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

// Bump this if the cached payload's shape ever changes — same reasoning as
// SEO_CACHE_KEY.
export const PAGE_IMAGES_CACHE_KEY = 'page-images:v1';

/**
 * Unlike HomepageCacheService, this isn't split into its own module —
 * nothing outside this module needs to bust it (page images are only ever
 * written through PageImagesAdminController) — same reasoning as
 * SeoCacheService.
 */
@Injectable()
export class PageImagesCacheService {
  private readonly logger = new Logger(PageImagesCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async get<T>(): Promise<T | undefined> {
    return this.cache.get<T>(PAGE_IMAGES_CACHE_KEY);
  }

  async set(value: unknown, ttlMs = 10 * 60 * 1000): Promise<void> {
    await this.cache.set(PAGE_IMAGES_CACHE_KEY, value, ttlMs);
  }

  async bust(): Promise<void> {
    await this.cache.del(PAGE_IMAGES_CACHE_KEY);
    this.logger.log('Page images cache busted');
  }
}
