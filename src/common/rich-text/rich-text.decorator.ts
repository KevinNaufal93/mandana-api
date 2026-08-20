import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { MAX_RICH_TEXT_HTML, MAX_RICH_TEXT_PLAIN } from './rich-text.config';
import { richTextToPlain, sanitizeRichText } from './sanitize-rich-text';

const RICH_TEXT_EXAMPLE =
  '<p>Rumah <strong>modern</strong> di BSD dengan akses tol.</p><ul><li>3 kamar tidur</li></ul>';

/**
 * Rejects payloads whose *visible text* (tags stripped) exceeds
 * `MAX_RICH_TEXT_PLAIN` even though the raw HTML is under
 * `MAX_RICH_TEXT_HTML` — markup overhead shouldn't let someone smuggle in an
 * arbitrarily long description.
 */
function MaxPlainTextLength(
  max: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'maxPlainTextLength',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [max],
      validator: {
        validate(value: unknown, args?: ValidationArguments) {
          if (typeof value !== 'string') return true;
          const limit = (args?.constraints as [number] | undefined)?.[0] ?? max;
          return (richTextToPlain(value)?.length ?? 0) <= limit;
        },
        defaultMessage(args?: ValidationArguments) {
          const limit = (args?.constraints as [number] | undefined)?.[0] ?? max;
          return `${args?.property ?? 'value'} text content must not exceed ${limit} characters`;
        },
      },
    });
  };
}

/**
 * Marks a DTO field as admin-authored rich text: sanitizes the incoming HTML
 * against the shared allow-list (`RICH_TEXT_SANITIZE_OPTIONS`) before any
 * validator runs, then enforces size limits on both the raw HTML and the
 * underlying plain text.
 *
 * Relies on the global `ValidationPipe({ transform: true })` (see
 * `main.ts`), which runs class-transformer before class-validator — so by
 * the time `@MaxLength` etc. see the value, it has already been sanitized.
 */
export function RichText(): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({
      example: RICH_TEXT_EXAMPLE,
      description:
        'Sanitized HTML rich text (allow-listed tags/attributes only — ' +
        'see docs/rich-text-descriptions.md). Images must be uploaded via ' +
        'POST /admin/media and referenced by URL; data: URIs are stripped.',
    }),
    IsOptional(),
    IsString(),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? sanitizeRichText(value) : value,
    ),
    MaxLength(MAX_RICH_TEXT_HTML),
    MaxPlainTextLength(MAX_RICH_TEXT_PLAIN),
  );
}
