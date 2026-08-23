import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';

/** Row shape for the raw peak-booked query below — `query()` returns `any`,
 * this gives the destructure an explicit, honest type. */
interface PeakBookedRow {
  itemId: string;
  peak: number;
}

/**
 * Availability for Event Support items is a *date-aware pool*, not a static
 * counter: `stockQuantity` minus the busiest single day inside the
 * requested window, counting only `confirmed` bookings (a `pending` booking
 * reserves nothing — same product decision as Smart Storage).
 *
 * This has to be a peak-per-day figure, not a sum across the window —
 * otherwise two bookings on non-overlapping days inside the same requested
 * range would incorrectly stack against stock. `generate_series` expands
 * the window into individual days and a LATERAL join sums booked quantity
 * per day; `MAX()` across those days is the answer.
 */
@Injectable()
export class EventAvailabilityService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Peak-per-day quantity booked for each item in `itemIds` across
   * `[startDate, endDate]` inclusive. Items with no overlapping confirmed
   * bookings come back as 0. `excludeBookingId` lets a booking's own lines
   * be left out of the count when re-validating it (e.g. on confirm, so a
   * booking never blocks against itself). Pass `runner` to run inside an
   * existing transaction (e.g. EventBookingsService.confirm(), which also
   * holds a row lock on these items) — otherwise runs directly on the pool.
   */
  async getPeakBooked(
    itemIds: string[],
    startDate: string,
    endDate: string,
    excludeBookingId?: string,
    runner?: QueryRunner,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (itemIds.length === 0) return result;

    const executor = runner ?? this.dataSource;
    const rows = (await executor.query(
      `SELECT bi.item_id AS "itemId", COALESCE(MAX(daily.booked), 0)::int AS peak
         FROM unnest($1::uuid[]) AS bi(item_id)
         LEFT JOIN LATERAL (
           SELECT d::date AS day, SUM(l.quantity)::int AS booked
           FROM generate_series($2::date, $3::date, '1 day') d
           JOIN event_booking_items l
             ON l.item_id = bi.item_id AND l.start_date <= d AND l.end_date >= d
           JOIN event_bookings b
             ON b.id = l.booking_id
            AND b.status = 'confirmed'
            AND ($4::uuid IS NULL OR b.id <> $4::uuid)
           GROUP BY d
         ) daily ON true
        GROUP BY bi.item_id`,
      [itemIds, startDate, endDate, excludeBookingId ?? null],
    )) as PeakBookedRow[];

    for (const row of rows) result.set(row.itemId, Number(row.peak));
    for (const id of itemIds) {
      if (!result.has(id)) result.set(id, 0);
    }
    return result;
  }

  /** Convenience single-item wrapper over `getPeakBooked()` for the public
   * catalog endpoints (list/detail), which never run inside a transaction. */
  async getAvailableQuantity(
    itemId: string,
    stockQuantity: number,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const peak = await this.getPeakBooked([itemId], startDate, endDate);
    return Math.max(0, stockQuantity - (peak.get(itemId) ?? 0));
  }
}
