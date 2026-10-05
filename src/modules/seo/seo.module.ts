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
import { SiteConfigCacheModule } from '../site-config/site-config-cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SeoSettings, PageSeo]),
    MediaModule,
    SiteConfigCacheModule,
  ],
  providers: [SeoService, SeoMapper, SeoCacheService],
  controllers: [SeoController, SeoAdminController],
  // SiteConfigService reads the General WhatsApp number through getSettings().
  exports: [SeoService],
})
export class SeoModule {}
