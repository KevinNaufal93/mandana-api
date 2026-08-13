import { UserRole } from '../../users/enums/user-role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number; // issued-at — auto-added by JWT library
  exp?: number;
}

/**
 * Marks a token as a short-lived, single-purpose SSE stream ticket rather
 * than a normal access token. `JwtStreamStrategy` requires this exact claim,
 * so a regular 15-minute access token pasted into a `?ticket=` query string
 * is rejected instead of silently working as a long-lived credential exposed
 * in URLs and access logs.
 */
export const STORAGE_STREAM_TICKET_PURPOSE = 'storage-stream';

export interface StreamTicketPayload extends JwtPayload {
  purpose: typeof STORAGE_STREAM_TICKET_PURPOSE;
}
