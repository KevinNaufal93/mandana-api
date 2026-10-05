import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from './entities/property.entity';
import { PropertySettings } from './entities/property-settings.entity';
import { PropertyType } from './entities/property-type.entity';
import { PropertyImage } from './entities/property-image.entity';
import { Amenity } from '../amenities/entities/amenity.entity';
import { PropertiesService } from './properties.service';
import { PropertySettingsService } from './property-settings.service';
import { PropertySettingsAdminController } from './property-settings.controller';
import {
  PropertiesController,
  PropertiesAdminController,
} from './properties.controller';
import { PropertyTypesController } from './property-types.controller';
import { PropertyMapper } from './property.mapper';
import { PropertyPromoMapper } from './property-promo.mapper';
import { MediaModule } from '../media/media.module';
import { HomepageCacheModule } from '../homepage/homepage-cache.module';
import { ContentBlocksModule } from '../content-blocks/content-blocks.module';
import { SiteConfigCacheModule } from '../site-config/site-config-cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Property,
      PropertyType,
      PropertyImage,
      Amenity,
      PropertySettings,
    ]),
    MediaModule,
    HomepageCacheModule,
    // Acyclic: ContentBlocksModule only reaches TypeOrmModule,
    // HomepageCacheModule, and MediaModule — it never imports
    // PropertiesModule. Pulled in so findBySlug() can source promoCards
    // via ContentBlocksService.findActivePropertyPromos().
    ContentBlocksModule,
    SiteConfigCacheModule,
  ],
  providers: [
    PropertiesService,
    PropertySettingsService,
    PropertyMapper,
    PropertyPromoMapper,
  ],
  controllers: [
    PropertiesController,
    PropertiesAdminController,
    PropertyTypesController,
    PropertySettingsAdminController,
  ],
  exports: [PropertyMapper, PropertySettingsService],
})
export class PropertiesModule {}
