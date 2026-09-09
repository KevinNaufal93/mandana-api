import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageUnitType } from './entities/storage-unit-type.entity';
import { StorageFacility } from './entities/storage-facility.entity';
import { StorageInventory } from './entities/storage-inventory.entity';
import { StorageUnit } from './entities/storage-unit.entity';
import { StorageBooking } from './entities/storage-booking.entity';
import { StorageSettings } from './entities/storage-settings.entity';
import { StorageService } from './storage.service';
import { StorageUnitsService } from './storage-units.service';
import { StorageBookingsService } from './storage-bookings.service';
import { StorageAvailabilityService } from './storage-availability.service';
import { StorageAvailabilityCacheService } from './storage-availability-cache.service';
import { StorageSettingsService } from './storage-settings.service';
import { StorageMapper } from './storage.mapper';
import {
  StorageController,
  StorageAdminController,
  StorageAdminStreamController,
} from './storage.controller';
import { StorageUnitsController } from './storage-units.controller';
import {
  StorageBookingsController,
  StorageBookingsAdminController,
} from './storage-bookings.controller';
import { StorageSettingsAdminController } from './storage-settings.controller';
import { MediaModule } from '../media/media.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StorageUnitType,
      StorageFacility,
      StorageInventory,
      StorageUnit,
      StorageBooking,
      StorageSettings,
    ]),
    MediaModule,
    // For AuthService.issueStreamTicket() — see POST /admin/storage/stream-ticket.
    AuthModule,
    NotificationsModule,
  ],
  providers: [
    StorageService,
    StorageUnitsService,
    StorageBookingsService,
    StorageAvailabilityService,
    StorageAvailabilityCacheService,
    StorageSettingsService,
    StorageMapper,
  ],
  controllers: [
    StorageController,
    StorageAdminController,
    StorageAdminStreamController,
    StorageUnitsController,
    StorageBookingsController,
    StorageBookingsAdminController,
    StorageSettingsAdminController,
  ],
  exports: [StorageService],
})
export class StorageModule {}
