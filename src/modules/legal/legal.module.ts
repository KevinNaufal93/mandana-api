import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LegalPage } from './entities/legal-page.entity';
import { LegalService } from './legal.service';
import { LegalMapper } from './legal.mapper';
import { LegalCacheService } from './legal-cache.service';
import { LegalController } from './legal.controller';
import { LegalAdminController } from './legal-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LegalPage])],
  providers: [LegalService, LegalMapper, LegalCacheService],
  controllers: [LegalController, LegalAdminController],
})
export class LegalModule {}
