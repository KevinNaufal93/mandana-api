/**
 * Pure date/money math for Event Support bookings and quotes. No Nest
 * decorators, no I/O — kept separate from EventBookingsService so it can be
 * unit tested directly and, if the FE ever wants an instant client-side
 * preview (like moving-pricing.ts / storage-pricing.ts), mirrored there
 * byte-for-byte.
 */

/** One priced line: an item, a quantity, and its own date range. */
export interface EventLineInput {
  pricePerDay: number;
  quantity: number;
  days: number;
}

export interface EventLineResult {
  pricePerDay: number;
  quantity: number;
  days: number;
  lineTotal: number;
}

export interface EventQuoteResult {
  lines: EventLineResult[];
  subtotal: number;
  discountAmount: number;
  total: number;
}

/** Coerces a possibly-invalid numeric input to a finite, non-negative integer. */
function nonNegativeInt(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/** Adds `days - 1` whole days to an ISO date string (UTC, no timezone drift)
 * and returns the result as `YYYY-MM-DD` — a 1-day rental starting and
 * ending on the same date, matching how the FE cart's "days" stepper reads. */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const safeDays = Math.max(1, Math.floor(days) || 1);
  const target = new Date(Date.UTC(y, m - 1, d + (safeDays - 1)));

  const yyyy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(target.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Computes one line's total. Defensively clamps non-finite/negative/zero
 * input to an all-zero result rather than emitting `NaN` — a broken number
 * on screen is worse than a zero.
 */
export function computeLine(input: EventLineInput): EventLineResult {
  const pricePerDay = nonNegativeInt(input.pricePerDay);
  const quantity = nonNegativeInt(input.quantity);
  const days = Math.max(1, nonNegativeInt(input.days) || 1);

  return {
    pricePerDay,
    quantity,
    days,
    lineTotal: pricePerDay * quantity * days,
  };
}

/** Aggregates already-computed lines into a cart total. No duration/volume
 * discount tiers exist for Event Support today — `discountAmount` is a
 * fixed 0, kept as a field so an admin-applied discount can be wired in
 * later without a response-shape change. */
export function aggregateEventQuote(
  lines: EventLineResult[],
): EventQuoteResult {
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const discountAmount = 0;
  return { lines, subtotal, discountAmount, total: subtotal - discountAmount };
}
