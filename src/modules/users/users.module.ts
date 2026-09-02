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
  exports: [UsersService],
})
export class UsersModule {}
