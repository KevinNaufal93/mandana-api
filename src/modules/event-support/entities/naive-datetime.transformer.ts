import { ValueTransformer } from 'typeorm';
import { parseNaiveDateTime } from '../event-pricing';

/**
 * Stores a naive local datetime ("2026-03-01T09:00", Asia/Jakarta by
 * convention — see rental-window.validator.ts) in a Postgres `timestamp
 * without time zone` column as a plain `string` property, matching how
 * `date` columns elsewhere in this repo are typed as `string`, not `Date`.
 *
 * Round-trips exactly with no timezone conversion because both sides use
 * the same "treat the wall clock as UTC" convention: `to()` builds a JS
 * Date via `Date.UTC(...)` (same as event-pricing.ts's parseNaiveDateTime),
 * and node-postgres's own TIMESTAMP (no zone) parser does the identical
 * thing when reading it back — it never applies a real UTC offset, since
 * "without time zone" has none. `from()` reads the value back with
 * `getUTC*`, never local getters, so this is also immune to the server
 * process's own TZ setting.
 */
export const naiveLocalDateTimeTransformer: ValueTransformer = {
  to(value: string | null | undefined): Date | null {
    if (value === null || value === undefined) return null;
    const ms = parseNaiveDateTime(value);
    return Number.isFinite(ms) ? new Date(ms) : null;
  },
  from(value: Date | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const yyyy = value.getUTCFullYear();
    const mm = String(value.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(value.getUTCDate()).padStart(2, '0');
    const hh = String(value.getUTCHours()).padStart(2, '0');
    const mi = String(value.getUTCMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  },
};
