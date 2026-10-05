/**
 * Admin-entered WhatsApp number for a line of business (Move / Space /
 * Living / General). Deliberately loose: ops type it however they write it
 * ("+62 812-3456-7890", "0812...", "(021) 5315 0000") and the web app
 * normalizes it for wa.me with its own toWaNumber(). The empty string is
 * allowed on purpose, because PATCH uses "" to clear the number (the
 * services map "" to null).
 */
export const WHATSAPP_NUMBER_PATTERN = /^$|^\+?\(?[0-9][0-9\s().-]{6,30}$/;

export const WHATSAPP_NUMBER_MESSAGE =
  'whatsappNumber must be a phone number such as +6281234567890 or 081234567890 (digits, spaces, + ( ) - . only), or an empty string to clear it';

export const WHATSAPP_NUMBER_MAX_LENGTH = 32;

/**
 * `@Transform` for the whatsappNumber DTO fields. Validation runs before the
 * services trim, so a number pasted with a stray leading or trailing space
 * would otherwise be rejected by the pattern instead of just saved clean.
 */
export function trimWhatsappNumber({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
