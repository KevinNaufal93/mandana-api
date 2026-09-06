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
 *
 * Originally `'storage-stream'`, scoped to Storage's admin SSE stream only.
 * Renamed when the Notifications module added a second admin SSE stream —
 * one shared purpose for every admin stream ticket, since `JwtStreamStrategy`
 * already re-checks the ADMIN role itself and neither stream carries
 * anything the other's ticket shouldn't be able to open.
 */
export const ADMIN_STREAM_TICKET_PURPOSE = 'admin-stream';

export interface StreamTicketPayload extends JwtPayload {
  purpose: typeof ADMIN_STREAM_TICKET_PURPOSE;
}
