import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TruckClass } from './entities/truck-class.entity';
import { MovingAddon } from './entities/moving-addon.entity';
import { MovingSettings } from './entities/moving-settings.entity';
import { MovingService } from './moving.service';
import { MovingAddonsService } from './moving-addons.service';
import { MovingSettingsService } from './moving-settings.service';
import { MovingMapper } from './moving.mapper';
import { MovingController, MovingAdminController } from './moving.controller';
import { MovingAddonsAdminController } from './moving-addons.controller';
import { MovingSettingsAdminController } from './moving-settings.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TruckClass, MovingAddon, MovingSettings]),
    MediaModule,
  ],
  providers: [
    MovingService,
    MovingAddonsService,
    MovingSettingsService,
    MovingMapper,
  ],
  controllers: [
    MovingController,
    MovingAdminController,
    MovingAddonsAdminController,
    MovingSettingsAdminController,
  ],
  exports: [MovingService, MovingAddonsService, MovingSettingsService],
})
export class MovingModule {}
