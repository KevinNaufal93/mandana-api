import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from './entities/property.entity';
import { PropertyType } from './entities/property-type.entity';
import { PropertyImage } from './entities/property-image.entity';
import { Amenity } from '../amenities/entities/amenity.entity';
import { PropertiesService } from './properties.service';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([Property, PropertyType, PropertyImage, Amenity]),
    MediaModule,
    HomepageCacheModule,
    // Acyclic: ContentBlocksModule only reaches TypeOrmModule,
    // HomepageCacheModule, and MediaModule — it never imports
    // PropertiesModule. Pulled in so findBySlug() can source promoCards
    // via ContentBlocksService.findActivePropertyPromos().
    ContentBlocksModule,
  ],
  providers: [PropertiesService, PropertyMapper, PropertyPromoMapper],
  controllers: [
    PropertiesController,
    PropertiesAdminController,
    PropertyTypesController,
  ],
  exports: [PropertyMapper],
})
export class PropertiesModule {}
