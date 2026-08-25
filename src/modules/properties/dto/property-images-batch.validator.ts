import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { PropertyImageInputDto } from './property-image-input.dto';

/**
 * Array-level cross-field checks for `UpdatePropertyDto.images` that no
 * single property's own decorators can express:
 *  - every entry has exactly one of `id`/`mediaAssetId` (XOR)
 *  - at most one entry has `isCover: true`
 *
 * Deliberately not built from per-property `@ValidateIf`: a `@ValidateIf`
 * gate on `id` (or `mediaAssetId`) skips *every* validator stacked on that
 * same property whenever the gate is false — including a co-located
 * cross-field check — so "both absent" would silently pass. Running once
 * over the whole array sidesteps that gating problem entirely.
 */
export function ValidPropertyImagesBatch(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'validPropertyImagesBatch',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (!Array.isArray(value)) return true; // let @IsArray report the type mismatch
          const entries = value as PropertyImageInputDto[];
          const xorOk = entries.every(
            (v) => (v?.id !== undefined) !== (v?.mediaAssetId !== undefined),
          );
          const coverCount = entries.filter((v) => v?.isCover === true).length;
          return xorOk && coverCount <= 1;
        },
        defaultMessage(args: ValidationArguments) {
          const entries = (args.value ?? []) as PropertyImageInputDto[];
          const problems: string[] = [];
          entries.forEach((v, i) => {
            if ((v?.id !== undefined) === (v?.mediaAssetId !== undefined)) {
              problems.push(
                `images[${i}] must have exactly one of id or mediaAssetId`,
              );
            }
          });
          const coverCount = entries.filter((v) => v?.isCover === true).length;
          if (coverCount > 1) {
            problems.push(
              `at most one image may have isCover: true (found ${coverCount})`,
            );
          }
          return problems.join('; ');
        },
      },
    });
  };
}
