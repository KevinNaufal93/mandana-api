const WORDS_PER_MINUTE = 200;

/** Word count over plain text (not raw HTML — see Article.bodyText) at a
 *  fixed 200 wpm, rounded, floored at 1 minute. Recomputed on every write
 *  that touches bodyHtml, not just at publish time, so an admin edit to a
 *  published article keeps this accurate. */
export function computeReadingMinutes(plainText: string): number {
  const words = plainText.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
