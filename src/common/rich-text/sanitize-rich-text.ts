import sanitizeHtml from 'sanitize-html';
import { decodeHTML } from 'entities';
import { RICH_TEXT_SANITIZE_OPTIONS } from './rich-text.config';

/** Tags whose mere presence counts as "visible content" even with no text. */
const VISUAL_CONTENT_TAG = /<(img|hr)\b/i;

/**
 * Allow-list sanitizes admin-authored rich text HTML (see
 * `RICH_TEXT_SANITIZE_OPTIONS`). Returns `''` when the sanitized result
 * carries no visible content — an editor's empty `<p><br></p>` should end up
 * as "no description", not as fake content — so callers can normalize that
 * to `null` before persisting. An image or divider with no surrounding text
 * still counts as content and is kept.
 */
export function sanitizeRichText(html: string): string {
  const clean = sanitizeHtml(html, RICH_TEXT_SANITIZE_OPTIONS).trim();
  const hasVisibleContent =
    richTextToPlain(clean) !== null || VISUAL_CONTENT_TAG.test(clean);
  return hasVisibleContent ? clean : '';
}

/**
 * Strips all markup down to plain text: decodes entities, inserts a space at
 * block boundaries (so `</p><p>` doesn't weld two words into one), and
 * collapses whitespace. Used for the FTS-backing column, SEO meta, and card
 * previews wherever a consumer needs a description without HTML.
 */
export function richTextToPlain(
  html: string | null | undefined,
): string | null {
  if (!html) return null;
  const withBoundarySpaces = html
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<hr\s*\/?>/gi, ' ');
  // `sanitizeHtml` with an empty allowlist strips tags but re-escapes text as
  // valid HTML (e.g. "&" -> "&amp;") — decode entities afterwards so callers
  // get real plain text, not HTML-escaped text.
  const stripped = sanitizeHtml(withBoundarySpaces, {
    allowedTags: [],
    allowedAttributes: {},
  });
  const text = decodeHTML(stripped).replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : null;
}
