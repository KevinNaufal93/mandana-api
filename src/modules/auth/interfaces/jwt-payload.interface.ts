import { UserRole } from '../../users/enums/user-role.enum';
import { AccessModule } from '../../../common/enums/access-module.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number; // issued-at — auto-added by JWT library
  exp?: number;
}

/**
 * Marks a token as a short-lived, single-purpose SSE stream ticket rather
 * than a normal access token. The stream strategy requires this exact
 * claim, so a regular 15-minute access token pasted into a `?ticket=` query
 * string is rejected instead of silently working as a long-lived credential
 * exposed in URLs and access logs.
 *
 * Originally `'storage-stream'`, scoped to Storage's admin SSE stream only.
 * Renamed to a shared purpose when Notifications added a second admin SSE
 * stream, back when every admin stream was hard-role-gated and a ticket for
 * either one was equivalent. That stopped being true once `notifications`
 * (like `storage`) became independently grantable: a ticket now also
 * carries `module`, and each stream registers its own strategy name
 * (jwt-stream-notifications / jwt-stream-storage, see jwt-stream.strategy.ts)
 * that only accepts a ticket whose `module` claim matches — otherwise a
 * ticket minted for a module the caller lacks would authenticate a
 * *different* stream the caller also lacks, just by sharing a purpose.
 */
export const ADMIN_STREAM_TICKET_PURPOSE = 'admin-stream';

export interface StreamTicketPayload extends JwtPayload {
  purpose: typeof ADMIN_STREAM_TICKET_PURPOSE;
  module: AccessModule;
}
