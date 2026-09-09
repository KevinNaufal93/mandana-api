import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** One guard per admin SSE stream, matching the strategy name registered
 *  for that stream's module in jwt-stream.strategy.ts — see that file's
 *  doc comment for why a single shared guard/strategy can't tell "ticket
 *  for notifications" apart from "ticket for storage". */
@Injectable()
export class JwtNotificationsStreamGuard extends AuthGuard(
  'jwt-stream-notifications',
) {}

@Injectable()
export class JwtStorageStreamGuard extends AuthGuard('jwt-stream-storage') {}
