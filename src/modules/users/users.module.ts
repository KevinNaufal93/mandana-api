import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersMapper } from './users.mapper';
import { UsersAdminController } from './users.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), MediaModule],
  providers: [UsersService, UsersMapper],
  controllers: [UsersAdminController],
  // UsersMapper is also consumed by AuthService (GET /auth/me) — see
  // AuthModule's import of this module.
  exports: [UsersService, UsersMapper],
})
export class UsersModule {}
