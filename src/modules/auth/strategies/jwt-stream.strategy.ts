import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { RbacService } from '../../rbac/rbac.service';
import { UserRole } from '../../users/enums/user-role.enum';
import { AccessModule } from '../../../common/enums/access-module.enum';
import {
  ADMIN_STREAM_TICKET_PURPOSE,
  StreamTicketPayload,
} from '../interfaces/jwt-payload.interface';

/**
 * One admin SSE stream, one Passport strategy name, one fixed `module` —
 * built by this factory rather than a single shared class so that a ticket
 * minted for one stream can never authenticate a different one. The
 * strategy *name* has to be fixed at the `extends PassportStrategy(...)`
 * call itself (Passport registers strategies globally by name), which is
 * exactly why this can't be "one class, module passed at construction
 * time" — each call to this factory produces a genuinely distinct class,
 * closing over its own `name`/`module` pair.
 *
 * Validates, in order: the ticket is actually a stream ticket (not a
 * regular access token), it was minted for *this* stream's module (not a
 * different one the caller also happens to hold a ticket for), the user
 * still exists/is active/isn't blacklisted, and — the part a stale ticket
 * can't fake — the live RBAC grant still includes this module. That last
 * check is what bounds a mid-flight revocation to nothing rather than to
 * the ticket's ~60s TTL: `RolesGuard` never runs for this route at all
 * (`@Public()` short-circuits it — see NotificationsAdminStreamController's
 * comment), so this `validate()` is the entire authorization boundary, not
 * just authentication.
 */
export function createJwtStreamStrategy(name: string, module: AccessModule) {
  @Injectable()
  class JwtStreamStrategyForModule extends PassportStrategy(Strategy, name) {
    // Parameter properties are `public` (not the usual `private`) because
    // this class is the inferred return type of an exported factory
    // function — TS4094 refuses to structurally describe an exported
    // type's private members, since a .d.ts consumer couldn't express
    // them. Nothing outside this class touches them either way.
    constructor(
      configService: ConfigService,
      public readonly usersService: UsersService,
      public readonly rbacService: RbacService,
      @Inject(CACHE_MANAGER) public readonly cacheManager: Cache,
    ) {
      super({
        jwtFromRequest: ExtractJwt.fromUrlQueryParameter('ticket'),
        ignoreExpiration: false,
        secretOrKey: configService.getOrThrow<string>('jwt.accessSecret'),
      });
    }

    async validate(payload: StreamTicketPayload) {
      if (payload.purpose !== ADMIN_STREAM_TICKET_PURPOSE) {
        throw new UnauthorizedException();
      }
      if (payload.module !== module) {
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

      // Admin short-circuits, same as RolesGuard/RbacService — never
      // touches the DB for the role that can't be locked out of anything.
      if (user.role !== UserRole.ADMIN) {
        const granted = await this.rbacService.hasModule(user.role, module);
        if (!granted) throw new UnauthorizedException();
      }

      return user;
    }
  }

  return JwtStreamStrategyForModule;
}

export const JwtNotificationsStreamStrategy = createJwtStreamStrategy(
  'jwt-stream-notifications',
  AccessModule.NOTIFICATIONS,
);

export const JwtStorageStreamStrategy = createJwtStreamStrategy(
  'jwt-stream-storage',
  AccessModule.STORAGE,
);
