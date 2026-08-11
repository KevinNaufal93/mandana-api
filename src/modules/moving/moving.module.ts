import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TruckClass } from './entities/truck-class.entity';
import { MovingService } from './moving.service';
import { MovingMapper } from './moving.mapper';
import { MovingController, MovingAdminController } from './moving.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [TypeOrmModule.forFeature([TruckClass]), MediaModule],
  providers: [MovingService, MovingMapper],
  controllers: [MovingController, MovingAdminController],
  exports: [MovingService],
})
export class MovingModule {}
