import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomepageRecommendation } from './entities/homepage-recommendation.entity';
import { HomepageService } from './homepage.service';
import { HomepageCacheService } from './homepage-cache.service';
import { HomepageController } from './homepage.controller';
import { HomepageAdminController } from './homepage-admin.controller';
import { HeroModule } from '../hero/hero.module';
import { CollectionsModule } from '../collections/collections.module';
import { MediaModule } from '../media/media.module';
import { PropertiesModule } from '../properties/properties.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([HomepageRecommendation]),
    HeroModule,
    CollectionsModule,
    MediaModule,
    PropertiesModule,
  ],
  providers: [HomepageService, HomepageCacheService],
  controllers: [HomepageController, HomepageAdminController],
})
export class HomepageModule {}
