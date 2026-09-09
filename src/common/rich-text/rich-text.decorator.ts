import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
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

export interface RichTextOptions {
  /**
   * When true, the field must be present and must still contain *something*
   * after sanitization — `sanitizeRichText()` returns `''` for input that has
   * no allow-listed content at all (e.g. a `<script>`-only payload), so this
   * is what turns that case into a 400 instead of silently persisting an
   * empty body. Defaults to false (today's behavior: optional, absent field
   * skips validation entirely).
   */
  required?: boolean;
}

/**
 * Marks a DTO field as admin-authored rich text: sanitizes the incoming HTML
 * against the shared allow-list (`RICH_TEXT_SANITIZE_OPTIONS`) before any
 * validator runs, then enforces size limits on both the raw HTML and the
 * underlying plain text.
 *
 * Relies on the global `ValidationPipe({ transform: true })` (see
 * `main.ts`), which runs class-transformer before class-validator — so by
 * the time `@MaxLength`/`@IsNotEmpty` etc. see the value, it has already
 * been sanitized. That's what makes `{ required: true }` reject a body that
 * sanitizes down to nothing, not just a body that was never sent.
 */
export function RichText(options: RichTextOptions = {}): PropertyDecorator {
  const { required = false } = options;

  return applyDecorators(
    ...(required
      ? [
          ApiProperty({
            example: RICH_TEXT_EXAMPLE,
            description:
              'Sanitized HTML rich text (allow-listed tags/attributes only — ' +
              'see docs/rich-text-descriptions.md). Images must be uploaded via ' +
              'POST /admin/media and referenced by URL; data: URIs are stripped.',
          }),
          IsNotEmpty(),
        ]
      : [
          ApiPropertyOptional({
            example: RICH_TEXT_EXAMPLE,
            description:
              'Sanitized HTML rich text (allow-listed tags/attributes only — ' +
              'see docs/rich-text-descriptions.md). Images must be uploaded via ' +
              'POST /admin/media and referenced by URL; data: URIs are stripped.',
          }),
          IsOptional(),
        ]),
    IsString(),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? sanitizeRichText(value) : value,
    ),
    MaxLength(MAX_RICH_TEXT_HTML),
    MaxPlainTextLength(MAX_RICH_TEXT_PLAIN),
  );
}
