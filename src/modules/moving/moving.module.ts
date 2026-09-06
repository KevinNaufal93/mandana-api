import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TruckClass } from './entities/truck-class.entity';
import { MovingAddon } from './entities/moving-addon.entity';
import { MovingSettings } from './entities/moving-settings.entity';
import { MovingBooking } from './entities/moving-booking.entity';
import { MovingBookingStop } from './entities/moving-booking-stop.entity';
import { MovingBookingAddon } from './entities/moving-booking-addon.entity';
import { MovingBookingLeg } from './entities/moving-booking-leg.entity';
import { MovingService } from './moving.service';
import { MovingAddonsService } from './moving-addons.service';
import { MovingSettingsService } from './moving-settings.service';
import { MovingBookingsService } from './moving-bookings.service';
import { MovingMapper } from './moving.mapper';
import { MovingController, MovingAdminController } from './moving.controller';
import { MovingAddonsAdminController } from './moving-addons.controller';
import { MovingSettingsAdminController } from './moving-settings.controller';
import {
  MovingBookingsController,
  MovingBookingsAdminController,
} from './moving-bookings.controller';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TruckClass,
      MovingAddon,
      MovingSettings,
      MovingBooking,
      MovingBookingStop,
      MovingBookingAddon,
      MovingBookingLeg,
    ]),
    MediaModule,
    NotificationsModule,
  ],
  providers: [
    MovingService,
    MovingAddonsService,
    MovingSettingsService,
    MovingBookingsService,
    MovingMapper,
  ],
  controllers: [
    MovingController,
    MovingAdminController,
    MovingAddonsAdminController,
    MovingSettingsAdminController,
    MovingBookingsController,
    MovingBookingsAdminController,
  ],
  exports: [MovingService, MovingAddonsService, MovingSettingsService],
})
export class MovingModule {}
