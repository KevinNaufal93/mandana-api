import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Amenity } from './entities/amenity.entity';
import { AmenitiesService } from './amenities.service';
import {
  AmenitiesController,
  AmenitiesAdminController,
} from './amenities.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Amenity])],
  providers: [AmenitiesService],
  controllers: [AmenitiesController, AmenitiesAdminController],
  exports: [AmenitiesService],
})
export class AmenitiesModule {}
