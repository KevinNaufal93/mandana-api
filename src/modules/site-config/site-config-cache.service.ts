import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

// Bump this if the cached payload shape ever changes, same reasoning as
// SEO_CACHE_KEY / HOMEPAGE_CACHE_KEY.
export const SITE_CONFIG_CACHE_KEY = 'site-config:v1';

/**
 * Split into its own module (see SiteConfigCacheModule) for the same reason
 * HomepageCacheService is: five unrelated settings services (Moving,
 * Storage, Event Support, SEO, Property) all bust the SAME cached payload
 * when an admin saves, so each of them needs to import this without
 * importing SiteConfigModule (which imports all five, which would be a cycle).
 *
 * Only ever stores the already-mapped payload (plain strings/numbers),
 * never an entity: a Redis hit round-trips through JSON, which turns a Date
 * into a string.
 */
@Injectable()
export class SiteConfigCacheService {
  private readonly logger = new Logger(SiteConfigCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async get<T>(): Promise<T | undefined> {
    return this.cache.get<T>(SITE_CONFIG_CACHE_KEY);
  }

  async set(value: unknown, ttlMs = 10 * 60 * 1000): Promise<void> {
    await this.cache.set(SITE_CONFIG_CACHE_KEY, value, ttlMs);
  }

  async bust(): Promise<void> {
    await this.cache.del(SITE_CONFIG_CACHE_KEY);
    this.logger.log('Site-config cache busted');
  }
}
