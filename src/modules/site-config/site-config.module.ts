import { Module } from '@nestjs/common';
import { MovingModule } from '../moving/moving.module';
import { StorageModule } from '../storage/storage.module';
import { EventSupportModule } from '../event-support/event-support.module';
import { PropertiesModule } from '../properties/properties.module';
import { SeoModule } from '../seo/seo.module';
import { SiteConfigCacheModule } from './site-config-cache.module';
import { SiteConfigService } from './site-config.service';
import { SiteConfigController } from './site-config.controller';

@Module({
  imports: [
    MovingModule,
    StorageModule,
    EventSupportModule,
    PropertiesModule,
    SeoModule,
    SiteConfigCacheModule,
  ],
  providers: [SiteConfigService],
  controllers: [SiteConfigController],
})
export class SiteConfigModule {}
