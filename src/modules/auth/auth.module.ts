import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtStreamStrategy } from './strategies/jwt-stream.strategy';

@Module({
  imports: [
    UsersModule,
    // AuthService.getProfile() (GET /auth/me) reports the caller's granted
    // modules alongside their role.
    RbacModule,
    PassportModule,
    // JwtModule registered without global secret — each sign call provides its own secret
    JwtModule.register({}),
  ],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy, JwtStreamStrategy],
  controllers: [AuthController],
  // AuthService is consumed by StorageModule (issueStreamTicket()) — see
  // POST /admin/storage/stream-ticket.
  exports: [AuthService],
})
export class AuthModule {}
