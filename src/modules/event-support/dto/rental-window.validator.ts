import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/** Matches `YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss` — no trailing `Z` or
 * offset. Deliberately not `@IsDateString`, which accepts full ISO 8601
 * including a timezone: this contract is a *naive* local datetime, always
 * Asia/Jakarta by convention, and a `Z` suffix would silently be UTC math
 * downstream (see event-pricing.ts's parseNaiveDateTime). */
const NAIVE_LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function isValidNaiveDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || !NAIVE_LOCAL_DATETIME_RE.test(value)) {
    return false;
  }
  const [datePart, timePart] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  if (hh > 23 || mm > 59) return false;
  const asDate = new Date(Date.UTC(y, m - 1, d, hh, mm));
  return (
    asDate.getUTCFullYear() === y &&
    asDate.getUTCMonth() === m - 1 &&
    asDate.getUTCDate() === d
  );
}

/** Field-level: `"2026-03-01T09:00"`, naive local datetime (Asia/Jakarta by
 * convention). Use on any single `dropoffAt`/`pickupAt` field; pair with
 * `@ValidRentalWindow()` on `pickupAt` for the pickup-after-dropoff check. */
export function IsNaiveLocalDateTime(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isNaiveLocalDateTime',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isValidNaiveDateTime(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a naive local datetime like "2026-03-01T09:00" (no timezone offset)`;
        },
      },
    });
  };
}

const MAX_WINDOW_DAYS = 365;

/**
 * Cross-field check applied to the `pickupAt` property:
 *  - `dropoffAt`/`pickupAt` must be both-present or both-absent (matters
 *    for the optional per-line override pair on QuoteEventSupportItemDto —
 *    the cart-level pair on QuoteEventSupportDto is required on both
 *    fields already, so this is a redundant-but-harmless extra error there)
 *  - when both are present, `pickupAt` must be strictly after `dropoffAt`,
 *    and the window must not exceed a year
 *
 * Deliberately not built from `@ValidateIf` — same rationale as
 * `ValidPropertyImagesBatch` in
 * properties/dto/property-images-batch.validator.ts: reads the whole
 * object via `args.object` instead of gating on one field, so "one absent"
 * is still reported rather than silently passing. When `dropoffAt` fails
 * its own `@IsNaiveLocalDateTime`, that error is left to report the
 * malformed-value case; this only judges presence and ordering.
 */
export function ValidRentalWindow(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'validRentalWindow',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const obj = args.object as Record<string, unknown>;
          const dropoffAt = obj.dropoffAt;
          const hasDropoff = dropoffAt !== undefined && dropoffAt !== null;
          const hasPickup = value !== undefined && value !== null;
          if (hasDropoff !== hasPickup) return false; // both-or-neither
          if (!hasDropoff && !hasPickup) return true;

          if (!isValidNaiveDateTime(dropoffAt)) return true; // let dropoffAt's own validator report it
          if (!isValidNaiveDateTime(value)) return true; // let pickupAt's own IsNaiveLocalDateTime report it

          const dropoffMs = Date.parse(`${dropoffAt}Z`);
          const pickupMs = Date.parse(`${value}Z`);
          if (pickupMs <= dropoffMs) return false;

          const windowDays = (pickupMs - dropoffMs) / (24 * 60 * 60 * 1000);
          return windowDays <= MAX_WINDOW_DAYS;
        },
        defaultMessage() {
          return `dropoffAt and pickupAt must both be set, pickupAt after dropoffAt, and the window must not exceed ${MAX_WINDOW_DAYS} days`;
        },
      },
    });
  };
}
