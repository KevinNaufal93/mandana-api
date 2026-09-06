import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminNotification } from './entities/admin-notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsMapper } from './notifications.mapper';
import {
  NotificationsAdminController,
  NotificationsAdminStreamController,
} from './notifications.controller';
import { AuthModule } from '../auth/auth.module';

// Imported by MovingModule / StorageModule / EventSupportModule, never the
// other way around -- see NotificationsService's doc comment for why this
// module knows nothing about any of the three booking tables it serves.
@Module({
  imports: [
    TypeOrmModule.forFeature([AdminNotification]),
    // For AuthService.issueStreamTicket() -- see POST /admin/notifications/stream-ticket.
    AuthModule,
  ],
  providers: [NotificationsService, NotificationsMapper],
  controllers: [
    NotificationsAdminController,
    NotificationsAdminStreamController,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
