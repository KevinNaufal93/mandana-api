import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { StorageAvailabilitySnapshotDto } from './dto/storage-response.dto';

export const STORAGE_AVAILABILITY_CACHE_KEY = 'storage:availability:v1';
const DEFAULT_TTL_MS = 30 * 1000;

/** Modelled on homepage/homepage-cache.service.ts. Keeps a fresh new SSE
 * connection (or a polling GET) to one Redis read instead of a Postgres
 * query — the snapshot only needs rebuilding when something actually
 * changes, via publish() in StorageAvailabilityService. */
@Injectable()
export class StorageAvailabilityCacheService {
  private readonly logger = new Logger(StorageAvailabilityCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async get(): Promise<StorageAvailabilitySnapshotDto | undefined> {
    return this.cache.get<StorageAvailabilitySnapshotDto>(
      STORAGE_AVAILABILITY_CACHE_KEY,
    );
  }

  async set(
    value: StorageAvailabilitySnapshotDto,
    ttlMs = DEFAULT_TTL_MS,
  ): Promise<void> {
    await this.cache.set(STORAGE_AVAILABILITY_CACHE_KEY, value, ttlMs);
  }

  async bust(): Promise<void> {
    await this.cache.del(STORAGE_AVAILABILITY_CACHE_KEY);
    this.logger.log('Storage availability cache busted');
  }
}
