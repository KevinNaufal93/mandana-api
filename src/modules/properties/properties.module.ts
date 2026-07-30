import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from './entities/property.entity';
import { PropertyType } from './entities/property-type.entity';
import { PropertyImage } from './entities/property-image.entity';
import { PropertiesService } from './properties.service';
import { PropertiesController } from './properties.controller';
import { PropertyTypesController } from './property-types.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Property, PropertyType, PropertyImage])],
  providers: [PropertiesService],
  controllers: [PropertiesController, PropertyTypesController],
})
export class PropertiesModule {}
