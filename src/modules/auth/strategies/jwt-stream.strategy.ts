import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { UserRole } from '../../users/enums/user-role.enum';
import {
  STORAGE_STREAM_TICKET_PURPOSE,
  StreamTicketPayload,
} from '../interfaces/jwt-payload.interface';

/**
 * Validates short-lived SSE stream tickets passed as `?ticket=` — EventSource
 * cannot send an `Authorization` header, so admin streams can't use the
 * normal `jwt` strategy. Reuses the access-token secret (no new env var),
 * but requires the `purpose` claim: without that check, a regular 15-minute
 * access token pasted into the query string would work fine too, putting a
 * long-lived credential into URLs, browser history, and CloudFront logs.
 */
@Injectable()
export class JwtStreamStrategy extends PassportStrategy(
  Strategy,
  'jwt-stream',
) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromUrlQueryParameter('ticket'),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: StreamTicketPayload) {
    if (payload.purpose !== STORAGE_STREAM_TICKET_PURPOSE) {
      throw new UnauthorizedException();
    }
    // Belt-and-suspenders: issueStreamTicket() only ever signs ADMIN roles
    // today, but the stream itself carries admin-only booking data, so this
    // is re-checked here rather than trusted from the token alone.
    if (payload.role !== UserRole.ADMIN) {
      throw new UnauthorizedException();
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    const blacklistedAt = await this.cacheManager.get<number>(
      `blacklist:${payload.sub}`,
    );
    if (blacklistedAt && payload.iat! * 1000 < blacklistedAt) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
