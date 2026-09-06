import { Injectable } from '@nestjs/common';
import { AdminNotification } from './entities/admin-notification.entity';
import {
  AdminNotificationDto,
  NotificationCreatedEventDto,
  NotificationSummaryDto,
} from './dto/notification-response.dto';

@Injectable()
export class NotificationsMapper {
  toDto(notification: AdminNotification): AdminNotificationDto {
    return {
      id: notification.id,
      sourceModule: notification.sourceModule,
      sourceId: notification.sourceId,
      reference: notification.reference,
      customerName: notification.customerName,
      total: notification.total,
      origin: notification.origin,
      readAt: notification.readAt?.toISOString() ?? null,
      resolvedAt: notification.resolvedAt?.toISOString() ?? null,
      resolvedStatus: notification.resolvedStatus,
      createdAt: notification.createdAt.toISOString(),
    };
  }

  toCreatedEvent(
    notification: AdminNotification,
    summary: NotificationSummaryDto,
  ): NotificationCreatedEventDto {
    return { ...this.toDto(notification), ...summary };
  }
}
