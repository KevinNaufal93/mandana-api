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
import { MediaModule } from '../media/media.module';
import { HomepageCacheModule } from '../homepage/homepage-cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Property, PropertyType, PropertyImage, Amenity]),
    MediaModule,
    HomepageCacheModule,
  ],
  providers: [PropertiesService, PropertyMapper],
  controllers: [
    PropertiesController,
    PropertiesAdminController,
    PropertyTypesController,
  ],
  exports: [PropertyMapper],
})
export class PropertiesModule {}
