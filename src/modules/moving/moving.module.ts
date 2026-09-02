import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TruckClass } from './entities/truck-class.entity';
import { MovingAddon } from './entities/moving-addon.entity';
import { MovingSettings } from './entities/moving-settings.entity';
import { MovingLead } from './entities/moving-lead.entity';
import { MovingLeadStop } from './entities/moving-lead-stop.entity';
import { MovingLeadAddon } from './entities/moving-lead-addon.entity';
import { MovingLeadLeg } from './entities/moving-lead-leg.entity';
import { MovingService } from './moving.service';
import { MovingAddonsService } from './moving-addons.service';
import { MovingSettingsService } from './moving-settings.service';
import { MovingLeadsService } from './moving-leads.service';
import { MovingMapper } from './moving.mapper';
import { MovingController, MovingAdminController } from './moving.controller';
import { MovingAddonsAdminController } from './moving-addons.controller';
import { MovingSettingsAdminController } from './moving-settings.controller';
import {
  MovingLeadsController,
  MovingLeadsAdminController,
} from './moving-leads.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TruckClass,
      MovingAddon,
      MovingSettings,
      MovingLead,
      MovingLeadStop,
      MovingLeadAddon,
      MovingLeadLeg,
    ]),
    MediaModule,
  ],
  providers: [
    MovingService,
    MovingAddonsService,
    MovingSettingsService,
    MovingLeadsService,
    MovingMapper,
  ],
  controllers: [
    MovingController,
    MovingAdminController,
    MovingAddonsAdminController,
    MovingSettingsAdminController,
    MovingLeadsController,
    MovingLeadsAdminController,
  ],
  exports: [MovingService, MovingAddonsService, MovingSettingsService],
})
export class MovingModule {}
