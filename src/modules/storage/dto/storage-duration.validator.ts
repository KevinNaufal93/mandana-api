import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { StorageDurationUnit } from '../enums/storage-duration-unit.enum';

const MAX_WEEKS = 260; // ~5 years, same horizon as the existing 60-month cap
const MAX_MONTHS = 60;

/**
 * Cross-field check applied to the `duration` property on QuoteStorageDto /
 * CreateStorageBookingDto — the additive sibling of `durationMonths`.
 * Mirrors rental-window.validator.ts's ValidRentalWindow: reads the whole
 * object via `args.object` rather than gating on one field, so a legacy
 * request that already sets `durationMonths` doesn't need this pair set at
 * all, but a request that sets both or neither is a real error, not a
 * silent pick-one.
 *
 *  - Exactly one of `durationMonths` or `duration` must be present.
 *  - `duration` requires `durationUnit`.
 *  - `durationMonths` implies `durationUnit: 'month'` if set at all (a
 *    `durationUnit: 'week'` alongside `durationMonths` is a contradiction).
 *  - Range depends on the unit: months 1-60 (the pre-existing rule via
 *    @Min/@Max on durationMonths itself), weeks 1-260.
 */
export function ValidStorageDuration(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'validStorageDuration',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const obj = args.object as Record<string, unknown>;
          const durationMonths = obj.durationMonths;
          const duration = value;
          const durationUnit = obj.durationUnit as
            StorageDurationUnit | undefined;

          const hasLegacyMonths =
            durationMonths !== undefined && durationMonths !== null;
          const hasDuration = duration !== undefined && duration !== null;

          if (hasLegacyMonths === hasDuration) return false; // exactly one, not both/neither

          if (hasLegacyMonths) {
            // durationMonths present: durationUnit, if given at all, must be 'month'.
            return (
              durationUnit === undefined ||
              durationUnit === StorageDurationUnit.MONTH
            );
          }

          // duration present: durationUnit is required, and range depends on it.
          if (
            durationUnit !== StorageDurationUnit.WEEK &&
            durationUnit !== StorageDurationUnit.MONTH
          ) {
            return false;
          }
          if (typeof duration !== 'number' || !Number.isInteger(duration)) {
            return false;
          }
          const max =
            durationUnit === StorageDurationUnit.WEEK ? MAX_WEEKS : MAX_MONTHS;
          return duration >= 1 && duration <= max;
        },
        defaultMessage() {
          return `Provide exactly one of durationMonths or (durationUnit + duration); duration must be an integer between 1 and ${MAX_WEEKS} for weeks or ${MAX_MONTHS} for months`;
        },
      },
    });
  };
}
