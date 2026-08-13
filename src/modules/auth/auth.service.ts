import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import {
  JwtPayload,
  STORAGE_STREAM_TICKET_PURPOSE,
  StreamTicketPayload,
} from './interfaces/jwt-payload.interface';
import { User } from '../users/entities/user.entity';

/** Ticket lifetime, seconds. Covers only the time to open the SSE connection
 * — once the stream is open it stays open; the ticket is never re-checked. */
const STREAM_TICKET_TTL_SECONDS = 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens(user);
  }

  async refresh(user: User) {
    return this.issueTokens(user);
  }

  /**
   * Mints a short-lived, single-purpose token for authenticating an
   * EventSource connection (`?ticket=`), which cannot send a normal
   * `Authorization` header. Reuses the access-token secret — no new env var
   * — but the `purpose` claim is what actually gates it: `JwtStreamStrategy`
   * rejects any token missing it, so a plain access token can't double as a
   * ticket even though it would otherwise verify fine against this secret.
   */
  async issueStreamTicket(
    user: User,
  ): Promise<{ ticket: string; expiresIn: number }> {
    const payload: StreamTicketPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      purpose: STORAGE_STREAM_TICKET_PURPOSE,
    };

    const accessSecret =
      this.configService.getOrThrow<string>('jwt.accessSecret');
    const ticket = await this.jwtService.signAsync(payload, {
      secret: accessSecret,
      expiresIn: STREAM_TICKET_TTL_SECONDS,
    });

    return { ticket, expiresIn: STREAM_TICKET_TTL_SECONDS };
  }

  async logout(userId: string) {
    const ttlMs = this.parseDurationMs(
      this.configService.getOrThrow<string>('jwt.accessExpiresIn'),
    );
    await Promise.all([
      this.usersService.updateRefreshToken(userId, null),
      this.cacheManager.set(`blacklist:${userId}`, Date.now(), ttlMs),
    ]);
  }

  private parseDurationMs(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 900_000;
    const multipliers: Record<string, number> = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return parseInt(match[1]) * multipliers[match[2]];
  }

  private async issueTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessSecret =
      this.configService.getOrThrow<string>('jwt.accessSecret');
    const accessExpiresIn = this.configService.getOrThrow<string>(
      'jwt.accessExpiresIn',
    );
    const refreshSecret =
      this.configService.getOrThrow<string>('jwt.refreshSecret');
    const refreshExpiresIn = this.configService.getOrThrow<string>(
      'jwt.refreshExpiresIn',
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn as never,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn as never,
      }),
    ]);

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.usersService.updateRefreshToken(user.id, hashedRefreshToken);

    return { accessToken, refreshToken };
  }
}
