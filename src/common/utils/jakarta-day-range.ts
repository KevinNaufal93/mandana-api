import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * Applies an inclusive Jakarta-calendar-day range filter to a UTC timestamp
 * column (`createdAt` on every booking/lead entity). Both bounds are snapped
 * via a fixed -7h shift (Indonesia is UTC+7, no DST) so a row captured at
 * 03:00 WIB isn't misfiled under the previous day. Written as `>=` / `<`
 * rather than wrapping the column in `DATE(...)` so the clauses stay
 * sargable for a future index — see idx_*_created_at.
 */
export function applyJakartaDayRange<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  column: string,
  from?: string,
  to?: string,
): void {
  if (from) {
    qb.andWhere(`${column} >= :from::date - INTERVAL '7 hours'`, { from });
  }
  if (to) {
    qb.andWhere(
      `${column} < :to::date + INTERVAL '1 day' - INTERVAL '7 hours'`,
      { to },
    );
  }
}
