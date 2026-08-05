import { Module } from '@nestjs/common';
import { HomepageCacheService } from './homepage-cache.service';

@Module({
  providers: [HomepageCacheService],
  exports: [HomepageCacheService],
})
export class HomepageCacheModule {}
