import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { LegalPageKey } from './enums/legal-page-key.enum';

// Bump if the cached payload's shape ever changes — same reasoning as
// SEO_CACHE_KEY.
const LEGAL_CACHE_PREFIX = 'legal:v1:';

/**
 * Per-key, not a single combined payload like SeoCacheService — the public
 * surface here is GET legal/:pageKey (the web app renders /privasi and
 * /syarat as two separate pages, each fetching only its own body), so
 * there's nothing to gain from caching both pages together.
 */
@Injectable()
export class LegalCacheService {
  private readonly logger = new Logger(LegalCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  private key(pageKey: LegalPageKey): string {
    return `${LEGAL_CACHE_PREFIX}${pageKey}`;
  }

  async get<T>(pageKey: LegalPageKey): Promise<T | undefined> {
    return this.cache.get<T>(this.key(pageKey));
  }

  async set(pageKey: LegalPageKey, value: unknown, ttlMs = 10 * 60 * 1000): Promise<void> {
    await this.cache.set(this.key(pageKey), value, ttlMs);
  }

  async bust(pageKey: LegalPageKey): Promise<void> {
    await this.cache.del(this.key(pageKey));
    this.logger.log(`Legal page cache busted: ${pageKey}`);
  }
}
