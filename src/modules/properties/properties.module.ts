import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from './entities/property.entity';
import { PropertyType } from './entities/property-type.entity';
import { PropertyImage } from './entities/property-image.entity';
import { PropertiesService } from './properties.service';
import { PropertiesController, PropertiesAdminController } from './properties.controller';
import { PropertyTypesController } from './property-types.controller';
import { MediaModule } from '../media/media.module';
import { HomepageCacheModule } from '../homepage/homepage-cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Property, PropertyType, PropertyImage]),
    MediaModule,
    HomepageCacheModule,
  ],
  providers: [PropertiesService],
  controllers: [PropertiesController, PropertiesAdminController, PropertyTypesController],
})
export class PropertiesModule {}
