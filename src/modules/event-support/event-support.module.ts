import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventCategory } from './entities/event-category.entity';
import { EventItem } from './entities/event-item.entity';
import { EventBooking } from './entities/event-booking.entity';
import { EventBookingItem } from './entities/event-booking-item.entity';
import { EventSupportSettings } from './entities/event-support-settings.entity';
import { EventCategoriesService } from './event-categories.service';
import { EventItemsService } from './event-items.service';
import { EventBookingsService } from './event-bookings.service';
import { EventAvailabilityService } from './event-availability.service';
import { EventSupportSettingsService } from './event-support-settings.service';
import { EventSupportMapper } from './event-support.mapper';
import {
  EventSupportController,
  EventSupportAdminController,
} from './event-support.controller';
import { EventBookingsAdminController } from './event-bookings.controller';
import { EventSupportSettingsAdminController } from './event-support-settings.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EventCategory,
      EventItem,
      EventBooking,
      EventBookingItem,
      EventSupportSettings,
    ]),
    MediaModule,
  ],
  providers: [
    EventCategoriesService,
    EventItemsService,
    EventBookingsService,
    EventAvailabilityService,
    EventSupportSettingsService,
    EventSupportMapper,
  ],
  controllers: [
    EventSupportController,
    EventSupportAdminController,
    EventBookingsAdminController,
    EventSupportSettingsAdminController,
  ],
  exports: [
    EventCategoriesService,
    EventItemsService,
    EventSupportSettingsService,
  ],
})
export class EventSupportModule {}
