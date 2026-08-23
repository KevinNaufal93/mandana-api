import { randomBytes } from 'crypto';

// No 0/O/1/I — avoids visual ambiguity when a customer reads the reference
// out loud over WhatsApp or phone.
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERENCE_CODE_LENGTH = 6;

/** How many times a caller should retry `generateBookingReference()` on a
 * unique-constraint collision before giving up — see each booking service's
 * create() for the retry loop. */
export const MAX_REFERENCE_ATTEMPTS = 5;

/** Postgres error code for a unique constraint violation. */
export const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * A short, human-readable booking reference: `${prefix}-XXXXXX` using a
 * collision-resistant random alphabet (36^6 ≈ 2.2 billion combinations)
 * with no visually ambiguous characters. Shared by every booking module
 * (storage, event-support, ...) so the format and retry rationale stay in
 * one place — see `docs/storage-integration.md` for the original design note.
 */
export function generateBookingReference(prefix: string): string {
  const bytes = randomBytes(REFERENCE_CODE_LENGTH);
  let code = '';
  for (const b of bytes)
    code += REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length];
  return `${prefix}-${code}`;
}
