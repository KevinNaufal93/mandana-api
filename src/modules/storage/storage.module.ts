import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageUnitType } from './entities/storage-unit-type.entity';
import { StorageFacility } from './entities/storage-facility.entity';
import { StorageInventory } from './entities/storage-inventory.entity';
import { StorageBooking } from './entities/storage-booking.entity';
import { StorageService } from './storage.service';
import { StorageBookingsService } from './storage-bookings.service';
import { StorageAvailabilityService } from './storage-availability.service';
import { StorageAvailabilityCacheService } from './storage-availability-cache.service';
import { StorageMapper } from './storage.mapper';
import {
  StorageController,
  StorageAdminController,
  StorageAdminStreamController,
} from './storage.controller';
import {
  StorageBookingsController,
  StorageBookingsAdminController,
} from './storage-bookings.controller';
import { MediaModule } from '../media/media.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StorageUnitType,
      StorageFacility,
      StorageInventory,
      StorageBooking,
    ]),
    MediaModule,
    // For AuthService.issueStreamTicket() — see POST /admin/storage/stream-ticket.
    AuthModule,
  ],
  providers: [
    StorageService,
    StorageBookingsService,
    StorageAvailabilityService,
    StorageAvailabilityCacheService,
    StorageMapper,
  ],
  controllers: [
    StorageController,
    StorageAdminController,
    StorageAdminStreamController,
    StorageBookingsController,
    StorageBookingsAdminController,
  ],
  exports: [StorageService],
})
export class StorageModule {}
