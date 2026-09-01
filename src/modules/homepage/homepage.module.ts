import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomepageRecommendation } from './entities/homepage-recommendation.entity';
import { HomepageService } from './homepage.service';
import { HomepageCacheModule } from './homepage-cache.module';
import { HomepageController } from './homepage.controller';
import { HomepageAdminController } from './homepage-admin.controller';
import { ContentBlocksModule } from '../content-blocks/content-blocks.module';
import { CollectionsModule } from '../collections/collections.module';
import { MediaModule } from '../media/media.module';
import { PropertiesModule } from '../properties/properties.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([HomepageRecommendation]),
    // Previously this module provided its own HomepageCacheService instance
    // instead of importing the shared module — harmless (the underlying
    // Cache is the app's single global CacheModule singleton either way,
    // so both instances read/write the same Redis key) but redundant DI
    // wiring; ContentBlocksModule/CollectionsModule/PropertiesModule already import
    // this the normal way.
    HomepageCacheModule,
    ContentBlocksModule,
    CollectionsModule,
    MediaModule,
    PropertiesModule,
  ],
  providers: [HomepageService],
  controllers: [HomepageController, HomepageAdminController],
})
export class HomepageModule {}
