import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeoSettings } from './entities/seo-settings.entity';
import { PageSeo } from './entities/page-seo.entity';
import { SeoService } from './seo.service';
import { SeoMapper } from './seo.mapper';
import { SeoCacheService } from './seo-cache.service';
import { SeoController } from './seo.controller';
import { SeoAdminController } from './seo-admin.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [TypeOrmModule.forFeature([SeoSettings, PageSeo]), MediaModule],
  providers: [SeoService, SeoMapper, SeoCacheService],
  controllers: [SeoController, SeoAdminController],
})
export class SeoModule {}
