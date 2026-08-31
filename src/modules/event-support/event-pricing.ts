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
 */

import { EventBillingMode } from './enums/event-billing-mode.enum';
import { EventOverThresholdMode } from './enums/event-over-threshold-mode.enum';

/** The pricing policy applied to a quote/booking — mirrors
 * EventSupportSettings minus id/timestamps. See event-support-settings.entity.ts. */
export interface EventPricingPolicy {
  hourlyThresholdHours: number;
  hourlyThresholdInclusive: boolean;
  defaultMinimumHours: number;
  roundingUnitMinutes: number;
  capHourlyAtDailyRate: boolean;
  overThresholdMode: EventOverThresholdMode;
}

/** Last-resort fallback, used only when no EventSupportSettings row exists
 * yet (see EventSupportSettingsService.get()). Reproduces the pre-hourly
 * behaviour exactly: any window prices as `ceil(hours / 24)` whole days. */
export const EVENT_PRICING_DEFAULTS: EventPricingPolicy = {
  hourlyThresholdHours: 24,
  hourlyThresholdInclusive: true,
  defaultMinimumHours: 2,
  roundingUnitMinutes: 30,
  capHourlyAtDailyRate: true,
  overThresholdMode: EventOverThresholdMode.WHOLE_DAYS,
};

/** One priced line's input: an item's rates/eligibility, a quantity, and
 * its own rental window (a line may override the cart-level window). */
export interface EventLineInput {
  pricePerDay: number;
  hourlyRate: number | null;
  supportsHourly: boolean;
  /** Item's own minimum billable hours; null falls back to
   * `policy.defaultMinimumHours`. */
  minimumHours: number | null;
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
  unitLabel: 'jam' | 'hari';
  /** Hours (billingMode: hourly) or days (billingMode: daily). Fractional
   * when roundingUnitMinutes < 60. */
  billableUnits: number;
  /** Only set under EventOverThresholdMode.DAY_PLUS_HOURLY when the window
   * has a non-zero remainder past its whole days; null otherwise. */
  extraHours: number | null;
  extraHoursTotal: number | null;
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

/** Same as nonNegativeInt but keeps fractional precision — used for
 * hour/day counts that may legitimately be fractional (rounding step < 60m). */
function nonNegativeNumber(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
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

/** Shared by computeLine and resolveActiveRate: the billable-hours figure
 * after rounding up to the policy's step. */
function roundedHoursOf(
  rawMinutes: number,
  policy: EventPricingPolicy,
): number {
  const roundingUnitMinutes = Math.max(
    1,
    nonNegativeInt(policy.roundingUnitMinutes) || 1,
  );
  const roundedMinutes =
    Math.ceil(rawMinutes / roundingUnitMinutes) * roundingUnitMinutes;
  return roundedMinutes / 60;
}

/** Shared by computeLine and resolveActiveRate: whether a rounded-hours
 * figure falls on the hourly side of the policy's threshold. */
function isWithinHourlyThreshold(
  roundedHours: number,
  policy: EventPricingPolicy,
): boolean {
  const threshold = nonNegativeNumber(policy.hourlyThresholdHours);
  return policy.hourlyThresholdInclusive
    ? roundedHours <= threshold
    : roundedHours < threshold;
}

/** The per-unit rate for the catalog endpoints (`activeRate`) — which rate
 * *would* apply to this item over this window, independent of quantity or
 * the §6.2 daily cap (that cap only bounds a line *total*, not a unit
 * price). The web renders this; it never decides which rate applies. */
export function resolveActiveRate(
  input: {
    pricePerDay: number;
    hourlyRate: number | null;
    supportsHourly: boolean;
  },
  dropoffAt: string,
  pickupAt: string,
  policy: EventPricingPolicy,
): { amount: number; unit: 'hour' | 'day'; label: 'jam' | 'hari' } {
  const pricePerDay = nonNegativeInt(input.pricePerDay);
  const hourlyRate =
    input.hourlyRate !== null && input.hourlyRate !== undefined
      ? nonNegativeInt(input.hourlyRate)
      : null;

  const rawMinutes = minutesBetween(dropoffAt, pickupAt);
  const canBillHourly =
    input.supportsHourly && hourlyRate !== null && hourlyRate > 0;

  if (rawMinutes > 0 && canBillHourly) {
    const roundedHours = roundedHoursOf(rawMinutes, policy);
    if (isWithinHourlyThreshold(roundedHours, policy)) {
      return { amount: hourlyRate, unit: 'hour', label: 'jam' };
    }
  }

  return { amount: pricePerDay, unit: 'day', label: 'hari' };
}

/**
 * Computes one line's total from its rental window and the item's rates,
 * per the resolved pricing policy. Defensively clamps non-finite/negative/
 * zero/inverted input to an all-zero result rather than emitting `NaN` —
 * "a broken number on screen is worse than a zero" (same convention as the
 * old computeLine).
 */
export function computeLine(
  input: EventLineInput,
  policy: EventPricingPolicy,
): EventLineResult {
  const pricePerDay = nonNegativeInt(input.pricePerDay);
  const hourlyRate =
    input.hourlyRate !== null && input.hourlyRate !== undefined
      ? nonNegativeInt(input.hourlyRate)
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
      extraHours: null,
      extraHoursTotal: null,
      lineTotal: 0,
    };
  }

  const roundedHours = roundedHoursOf(rawMinutes, policy);
  const withinThreshold = isWithinHourlyThreshold(roundedHours, policy);

  const canBillHourly =
    input.supportsHourly && hourlyRate !== null && hourlyRate > 0;
  const effectiveMinHours = nonNegativeNumber(
    input.minimumHours ?? policy.defaultMinimumHours,
  );

  if (canBillHourly && withinThreshold) {
    const billableUnits = Math.max(roundedHours, effectiveMinHours);
    const raw = Math.round(hourlyRate * billableUnits) * quantity;
    const lineTotal = policy.capHourlyAtDailyRate
      ? Math.min(raw, pricePerDay * quantity)
      : raw;

    return {
      quantity,
      dropoffAt: input.dropoffAt,
      pickupAt: input.pickupAt,
      startDate,
      endDate,
      billingMode: EventBillingMode.HOURLY,
      unitPrice: hourlyRate,
      unitLabel: 'jam',
      billableUnits,
      extraHours: null,
      extraHoursTotal: null,
      lineTotal,
    };
  }

  // Daily billing — either the item doesn't support hourly, its rate is
  // unset, or the window is past the threshold.
  const useDayPlusHourly =
    canBillHourly &&
    policy.overThresholdMode === EventOverThresholdMode.DAY_PLUS_HOURLY;

  if (useDayPlusHourly) {
    const wholeDays = Math.floor(roundedHours / 24);
    const remainderHours = roundedHours - wholeDays * 24;

    let extraHours: number | null = null;
    let extraHoursTotal: number | null = null;
    if (remainderHours > 0) {
      extraHours = Math.max(remainderHours, effectiveMinHours);
      extraHoursTotal = Math.round(hourlyRate * extraHours) * quantity;
    }

    return {
      quantity,
      dropoffAt: input.dropoffAt,
      pickupAt: input.pickupAt,
      startDate,
      endDate,
      billingMode: EventBillingMode.DAILY,
      unitPrice: pricePerDay,
      unitLabel: 'hari',
      billableUnits: wholeDays,
      extraHours,
      extraHoursTotal,
      lineTotal: pricePerDay * wholeDays * quantity + (extraHoursTotal ?? 0),
    };
  }

  // whole_days — ceil up to the next full day, minimum 1. Byte-identical
  // to the pre-hourly-pricing behaviour (and to the web's stopgap adapter).
  const billableUnits = Math.max(1, Math.ceil(roundedHours / 24));
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
    extraHours: null,
    extraHoursTotal: null,
    lineTotal: pricePerDay * billableUnits * quantity,
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
