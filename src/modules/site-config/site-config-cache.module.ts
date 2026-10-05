import { Module } from '@nestjs/common';
import { SiteConfigCacheService } from './site-config-cache.service';

@Module({
  providers: [SiteConfigCacheService],
  exports: [SiteConfigCacheService],
})
export class SiteConfigCacheModule {}
