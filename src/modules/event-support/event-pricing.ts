/**
 * Pure date/money math for Event Support bookings and quotes. No Nest
 * decorators, no I/O — kept separate from EventItemsService/
 * EventBookingsService so it can be unit tested directly and, if the FE
 * ever wants an instant client-side preview (like moving-pricing.ts /
 * storage-pricing.ts), mirrored there byte-for-byte.
 *
 * Rental windows are naive local datetimes (Asia/Jakarta by convention,
 * see rental-window.validator.ts) — `parseNaiveDateTime` treats the wall
 * clock as if it were UTC via `Date.UTC(...)`, the same trick the old
 * `addDaysToDateString` used. Differences between two such values are
 * correct because both endpoints share the same fiction; Indonesia has no
 * DST, so this never drifts.
 *
 * There is no pricing policy left to configure — a previous iteration of
 * this file had a flexible-hourly model (threshold, rounding step, minimum
 * hours, a day_plus_hourly remainder mode, all admin-tunable). The product
 * decision was simpler than that: there is no hourly product, only "daily,
 * or per eight hours." See migration
 * 1788600000000-ReplaceEventHourlyWithEightHourPricing.
 */

import { EventBillingMode } from './enums/event-billing-mode.enum';

/** The one sub-daily rental Event Support sells: a fixed 8-hour block at
 * its own rate, no per-hour math. Deliberately a constant, not a setting —
 * "either daily, or per eight hours" is a product rule, not a knob. */
export const EIGHT_HOUR_BLOCK_MINUTES = 480;

/** One priced line's input: an item's rates/eligibility, a quantity, and
 * its own rental window (a line may override the cart-level window). */
export interface EventLineInput {
  pricePerDay: number;
  eightHourRate: number | null;
  supportsEightHour: boolean;
  quantity: number;
  /** Naive local datetime, e.g. "2026-03-01T09:00". */
  dropoffAt: string;
  pickupAt: string;
}

export interface EventLineResult {
  quantity: number;
  dropoffAt: string;
  pickupAt: string;
  /** Derived calendar span the item is held — see windowStartDate/windowEndDate. */
  startDate: string;
  endDate: string;
  billingMode: EventBillingMode;
  unitPrice: number;
  unitLabel: '8 jam' | 'hari';
  /** Always 1 under EIGHT_HOUR billing (one block); the whole-day count
   * under DAILY billing. */
  billableUnits: number;
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

/** Parses a naive local datetime ("YYYY-MM-DDTHH:mm[:ss]") to epoch ms,
 * treating the wall clock as UTC. Returns NaN for malformed input — callers
 * must validate with `@IsNaiveLocalDateTime` before this ever runs, but
 * this function stays defensive rather than throwing. */
export function parseNaiveDateTime(value: string): number {
  const [datePart, timePart] = (value ?? '').split('T');
  if (!datePart || !timePart) return NaN;
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss] = timePart.split(':').map(Number);
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return NaN;
  return Date.UTC(y, m - 1, d, hh, mm, Number.isFinite(ss) ? ss : 0);
}

export function minutesBetween(dropoffAt: string, pickupAt: string): number {
  const diff = parseNaiveDateTime(pickupAt) - parseNaiveDateTime(dropoffAt);
  return Number.isFinite(diff) ? diff / 60_000 : 0;
}

function formatDateFromEpochMs(ms: number): string {
  if (!Number.isFinite(ms)) return '1970-01-01';
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** The calendar date the item is dropped off on. */
export function windowStartDate(dropoffAt: string): string {
  return formatDateFromEpochMs(parseNaiveDateTime(dropoffAt));
}

/** The calendar date of the *last instant* the item is held — i.e. the
 * date one minute before pickup. A midnight-to-midnight window (00:00 on
 * one day to 00:00 the next) yields the first day only, preserving the
 * old inclusive one-day-rental semantics; a same-evening-to-next-morning
 * window (e.g. 20:00 -> next day's 06:00) correctly spans both days. */
export function windowEndDate(pickupAt: string): string {
  return formatDateFromEpochMs(parseNaiveDateTime(pickupAt) - 60_000);
}

/** Indonesia has one fixed offset (WIB, UTC+7) and no DST, so "today in
 * Jakarta" is just server-UTC-now shifted by a constant — no timezone
 * library needed. Replaces the old `new Date().toISOString().slice(0,10)`,
 * which was wrong between 00:00-07:00 WIB (still "yesterday" in UTC). */
export function todayInJakarta(): string {
  const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
  return new Date(Date.now() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** The per-unit rate for the catalog endpoints (`activeRate`) — which rate
 * *would* apply to this item over this window, independent of quantity.
 * The web renders this; it never decides which rate applies. This now
 * agrees with computeLine() below in every case — there is no minimum-
 * hours floor or daily cap left to make the two diverge, unlike the old
 * flexible-hourly model. */
export function resolveActiveRate(
  input: {
    pricePerDay: number;
    eightHourRate: number | null;
    supportsEightHour: boolean;
  },
  dropoffAt: string,
  pickupAt: string,
): { amount: number; unit: 'eight_hour' | 'day'; label: '8 jam' | 'hari' } {
  const pricePerDay = nonNegativeInt(input.pricePerDay);
  const eightHourRate =
    input.eightHourRate !== null && input.eightHourRate !== undefined
      ? nonNegativeInt(input.eightHourRate)
      : null;

  const rawMinutes = minutesBetween(dropoffAt, pickupAt);
  const canBillEightHour =
    input.supportsEightHour && eightHourRate !== null && eightHourRate > 0;

  if (
    rawMinutes > 0 &&
    canBillEightHour &&
    rawMinutes <= EIGHT_HOUR_BLOCK_MINUTES
  ) {
    return { amount: eightHourRate, unit: 'eight_hour', label: '8 jam' };
  }

  return { amount: pricePerDay, unit: 'day', label: 'hari' };
}

/**
 * Computes one line's total from its rental window and the item's rates.
 * A window at or under EIGHT_HOUR_BLOCK_MINUTES (480 = 8 hours) prices as
 * one 8-hour block when the item opts in and carries a positive rate;
 * anything longer — or any item that doesn't support the block — prices
 * as `ceil(minutes / 1440)` whole days. There is no rate in between: this
 * is the one sub-daily option, not a threshold into per-hour billing.
 * Defensively clamps non-finite/negative/zero/inverted input to an
 * all-zero result rather than emitting `NaN` — "a broken number on screen
 * is worse than a zero" (same convention as the old computeLine).
 */
export function computeLine(input: EventLineInput): EventLineResult {
  const pricePerDay = nonNegativeInt(input.pricePerDay);
  const eightHourRate =
    input.eightHourRate !== null && input.eightHourRate !== undefined
      ? nonNegativeInt(input.eightHourRate)
      : null;
  const quantity = nonNegativeInt(input.quantity);
  const startDate = windowStartDate(input.dropoffAt);
  const endDate = windowEndDate(input.pickupAt);

  const rawMinutes = minutesBetween(input.dropoffAt, input.pickupAt);
  if (!(rawMinutes > 0) || quantity === 0) {
    return {
      quantity,
      dropoffAt: input.dropoffAt,
      pickupAt: input.pickupAt,
      startDate,
      endDate,
      billingMode: EventBillingMode.DAILY,
      unitPrice: pricePerDay,
      unitLabel: 'hari',
      billableUnits: 0,
      lineTotal: 0,
    };
  }

  const canBillEightHour =
    input.supportsEightHour && eightHourRate !== null && eightHourRate > 0;

  if (canBillEightHour && rawMinutes <= EIGHT_HOUR_BLOCK_MINUTES) {
    return {
      quantity,
      dropoffAt: input.dropoffAt,
      pickupAt: input.pickupAt,
      startDate,
      endDate,
      billingMode: EventBillingMode.EIGHT_HOUR,
      unitPrice: eightHourRate,
      unitLabel: '8 jam',
      billableUnits: 1,
      lineTotal: eightHourRate * quantity,
    };
  }

  // Daily billing — either the item doesn't support the 8-hour block, its
  // rate is unset, or the window runs longer than one block. Byte-identical
  // to the pre-8-hour-pricing behaviour: `ceil(minutes / 1440)`, minimum 1
  // (1440 minutes = 24 hours; equal to the old `ceil(hours / 24)` since 60
  // divides 1440 exactly).
  const billableUnits = Math.max(1, Math.ceil(rawMinutes / 1440));
  return {
    quantity,
    dropoffAt: input.dropoffAt,
    pickupAt: input.pickupAt,
    startDate,
    endDate,
    billingMode: EventBillingMode.DAILY,
    unitPrice: pricePerDay,
    unitLabel: 'hari',
    billableUnits,
    lineTotal: pricePerDay * billableUnits * quantity,
  };
}

/** Aggregates already-computed lines into a cart total. No discount tiers
 * exist for Event Support today — `discountAmount` is a fixed 0, kept as a
 * field so an admin-applied discount can be wired in later without a
 * response-shape change. */
export function aggregateEventQuote(
  lines: EventLineResult[],
): EventQuoteResult {
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const discountAmount = 0;
  return { lines, subtotal, discountAmount, total: subtotal - discountAmount };
}
