import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Observable, Subject, from, interval, merge } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { StorageInventory } from './entities/storage-inventory.entity';
import { StorageUnit } from './entities/storage-unit.entity';
import { StorageAvailabilityCacheService } from './storage-availability-cache.service';
import { StorageMapper } from './storage.mapper';
import {
  StorageAvailabilitySnapshotDto,
  StorageBookingCreatedEventDto,
  StorageBookingUpdatedEventDto,
} from './dto/storage-response.dto';

/** CloudFront's origin response timeout (30s default) applies *between*
 * packets of an in-flight response, not just to the first byte — a quiet
 * SSE stream gets killed. 15s (not 20s) because `sharp` image processing
 * runs in this same Node process; a `setInterval` tick delayed by a busy
 * event loop can land past a 20s target's margin, but not 15s's. */
const HEARTBEAT_MS = 15_000;

const EMPTY_SNAPSHOT: StorageAvailabilitySnapshotDto = {
  version: 'empty',
  generatedAt: new Date(0).toISOString(),
  facilities: [],
};

type AdminEvent =
  | { type: 'booking.created'; data: StorageBookingCreatedEventDto }
  | { type: 'booking.updated'; data: StorageBookingUpdatedEventDto };

/**
 * Owns the two SSE streams (public: counts only · admin: counts + booking
 * events) and the Redis-backed availability snapshot they both read.
 *
 * The snapshot is built once per publish() call and pushed to a hot Subject
 * — every connected stream receives that same object, so N viewers cost one
 * DB read, not N. A brand-new connection's *first* emission instead comes
 * from getSnapshot(), which is cache-first (one Redis GET) and only falls
 * back to Postgres on a cache miss — that's what keeps a fresh subscriber
 * cheap too, not an rxjs replay operator.
 */
@Injectable()
export class StorageAvailabilityService {
  private readonly logger = new Logger(StorageAvailabilityService.name);
  private lastKnownGood: StorageAvailabilitySnapshotDto = EMPTY_SNAPSHOT;

  private readonly availability$ =
    new Subject<StorageAvailabilitySnapshotDto>();
  private readonly bookingEvents$ = new Subject<AdminEvent>();

  constructor(
    @InjectRepository(StorageInventory)
    private readonly inventoryRepo: Repository<StorageInventory>,
    @InjectRepository(StorageUnit)
    private readonly unitRepo: Repository<StorageUnit>,
    private readonly cache: StorageAvailabilityCacheService,
    private readonly mapper: StorageMapper,
  ) {}

  private async buildSnapshot(): Promise<StorageAvailabilitySnapshotDto> {
    // Drives which facility×type pairs are offered, and at what rate.
    const inventoryRows = await this.inventoryRepo.find({
      where: {
        isActive: true,
        facility: { isActive: true },
        unitType: { isActive: true },
      },
      relations: { facility: true, unitType: true },
      order: {
        facility: { sortOrder: 'ASC' },
        unitType: { sortOrder: 'ASC' },
      },
    });

    // Supplies live per-unit counts and the floor-plan layout.
    const unitRows = await this.unitRepo.find({
      where: {
        isActive: true,
        facility: { isActive: true },
        unitType: { isActive: true },
      },
      relations: { facility: true, unitType: true },
      order: {
        facility: { sortOrder: 'ASC' },
        unitType: { sortOrder: 'ASC' },
        code: 'ASC',
      },
    });

    // The complete per-facility object — summary `units[]` AND `layout`
    // together — MUST be what gets hashed below. Hashing a subset (e.g.
    // only the summary counts) would let a same-type, net-zero status swap
    // produce an identical hash, silently breaking both the polling `ETag`
    // and the FE's SSE dedup on `version`. See docs/storage-floor-plan-response.md §1.
    const facilities = this.mapper.buildAvailabilityFacilities(
      inventoryRows,
      unitRows,
    );
    const version = createHash('md5')
      .update(JSON.stringify(facilities))
      .digest('hex');
    const snapshot: StorageAvailabilitySnapshotDto = {
      version,
      generatedAt: new Date().toISOString(),
      facilities,
    };

    this.lastKnownGood = snapshot;
    await this.cache.set(snapshot);
    return snapshot;
  }

  /** Cache-first read. Never throws — falls back to the last good snapshot
   * (or an empty-but-valid one at cold boot) so a transient DB/Redis hiccup
   * degrades a stream's next emission instead of ending the connection. */
  async getSnapshot(): Promise<StorageAvailabilitySnapshotDto> {
    try {
      const cached = await this.cache.get();
      if (cached) return cached;
    } catch (err) {
      this.logger.error('Failed to read availability cache', err);
    }

    try {
      return await this.buildSnapshot();
    } catch (err) {
      this.logger.error('Failed to build availability snapshot', err);
      return this.lastKnownGood;
    }
  }

  /** Call after any write that moves a count: booking confirm/cancel/
   * complete, or an admin unit-type/facility/inventory edit. */
  async publish(): Promise<void> {
    await this.cache.bust();
    const snapshot = await this.buildSnapshot();
    this.availability$.next(snapshot);
  }

  publishBookingCreated(data: StorageBookingCreatedEventDto): void {
    this.bookingEvents$.next({ type: 'booking.created', data });
  }

  publishBookingUpdated(data: StorageBookingUpdatedEventDto): void {
    this.bookingEvents$.next({ type: 'booking.updated', data });
  }

  private availabilityMessages$(): Observable<MessageEvent> {
    return merge(from(this.getSnapshot()), this.availability$).pipe(
      map((data) => ({ type: 'availability', data })),
    );
  }

  /** Heartbeat payload must be non-empty: Nest's SseStream only writes a
   * `data:` line when `message.data` is truthy, and per the SSE spec a
   * frame with no `data:` line at all dispatches no event on the client —
   * `data: ''` would keep the connection open (bytes still flow, which is
   * all CloudFront's idle timer cares about) but silently never fire an
   * `addEventListener('ping', ...)` on the client. */
  private heartbeat$(): Observable<MessageEvent> {
    return interval(HEARTBEAT_MS).pipe(
      map(() => ({ type: 'ping', data: { time: new Date().toISOString() } })),
    );
  }

  /** Public stream: counts only. @Public() — anyone can open this, so it
   * must never be fed anything derived from bookingEvents$. */
  publicStream(): Observable<MessageEvent> {
    return merge(this.availabilityMessages$(), this.heartbeat$()).pipe(
      catchError((err) => {
        this.logger.error('Public availability stream error', err);
        return this.heartbeat$();
      }),
    );
  }

  /** Admin stream: counts + booking lifecycle events. Ticket-authenticated
   * (see JwtStreamGuard) — never mounted behind @Public() directly. */
  adminStream(): Observable<MessageEvent> {
    const bookingMessages$ = this.bookingEvents$.pipe(
      map(({ type, data }) => ({ type, data })),
    );

    return merge(
      this.availabilityMessages$(),
      bookingMessages$,
      this.heartbeat$(),
    ).pipe(
      catchError((err) => {
        this.logger.error('Admin storage stream error', err);
        return this.heartbeat$();
      }),
    );
  }
}
