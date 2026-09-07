import { Injectable } from '@nestjs/common';
import { AdminNotification } from './entities/admin-notification.entity';
import {
  AdminNotificationDto,
  NotificationCreatedEventDto,
  NotificationSnapshotEventDto,
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

  /** Fed to the admin stream once per connect (see
   *  NotificationsService.stream()) so a fresh EventSource -- first load,
   *  tab-visibility reconnect, or error retry -- never has to rely on a
   *  server-rendered seed that may be stale by the time the connection
   *  actually opens. */
  toSnapshotEvent(
    notifications: AdminNotification[],
    summary: NotificationSummaryDto,
  ): NotificationSnapshotEventDto {
    return { items: notifications.map((n) => this.toDto(n)), ...summary };
  }
}
