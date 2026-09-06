import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationSourceModule } from '../enums/notification-source-module.enum';
import { NotificationOrigin } from '../enums/notification-origin.enum';

/**
 * Response-shape DTOs, declared purely so Swagger/OpenAPI can describe the
 * `{ data }` envelope the global `TransformInterceptor` wraps handler
 * returns in — same convention as storage/dto/storage-response.dto.ts.
 * Handlers keep returning bare objects; these classes exist only to drive
 * `@ApiOkResponse`. (`@Sse('stream')` is exempt — OpenAPI has no useful way
 * to describe a `text/event-stream` body — documented via `@ApiOperation`
 * description text instead.)
 */

export class AdminNotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NotificationSourceModule })
  sourceModule!: NotificationSourceModule;
  @ApiProperty({
    description: 'uuid of the booking row in its own module’s table',
  })
  sourceId!: string;
  @ApiProperty() reference!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) customerName!:
    string | null;
  @ApiProperty({ description: 'Rupiah' }) total!: number;
  @ApiProperty({ enum: NotificationOrigin }) origin!: NotificationOrigin;
  @ApiPropertyOptional({ nullable: true, type: String }) readAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) resolvedAt!:
    string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'The status the booking landed on — module-specific values (e.g. "confirmed", "rejected"); null while still pending',
  })
  resolvedStatus!: string | null;
  @ApiProperty() createdAt!: string;
}

export class NotificationResponseDto {
  @ApiProperty({ type: AdminNotificationDto })
  data!: AdminNotificationDto;
}

// Not named `PaginationMetaDto` — every module with a paginated list names
// its own (StorageBookingAdminListResponseDto's PaginationMetaDto,
// MovingBookingPaginationMetaDto, EventPaginationMetaDto, ...) to avoid an
// OpenAPI schema-name collision, since Swagger derives schema names from the
// class name and requires them unique across the whole API document.
export class NotificationPaginationMetaDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalPages!: number;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [AdminNotificationDto] })
  data!: AdminNotificationDto[];

  @ApiProperty({ type: NotificationPaginationMetaDto })
  meta!: NotificationPaginationMetaDto;
}

export class NotificationSummaryDto {
  @ApiProperty({
    description: 'Bookings still pending — never decremented by reading',
  })
  unresolvedCount!: number;
  @ApiProperty({ description: 'Notifications with no readAt yet' })
  unreadCount!: number;
}

export class NotificationSummaryResponseDto {
  @ApiProperty({ type: NotificationSummaryDto })
  data!: NotificationSummaryDto;
}

// ─── Admin SSE stream ticket ─────────────────────────────────────────────────

export class NotificationStreamTicketDto {
  @ApiProperty({
    description: 'Pass as ?ticket= on GET /admin/notifications/stream',
  })
  ticket!: string;
  @ApiProperty({ description: 'Seconds until the ticket expires', example: 60 })
  expiresIn!: number;
}

export class NotificationStreamTicketResponseDto {
  @ApiProperty({ type: NotificationStreamTicketDto })
  data!: NotificationStreamTicketDto;
}

// ─── Admin SSE stream events ─────────────────────────────────────────────────
// (notification.created / notification.resolved / notification.read / ping)

export class NotificationCreatedEventDto extends AdminNotificationDto {
  @ApiProperty() unresolvedCount!: number;
  @ApiProperty() unreadCount!: number;
}

export class NotificationResolvedEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NotificationSourceModule })
  sourceModule!: NotificationSourceModule;
  @ApiProperty() sourceId!: string;
  @ApiProperty() resolvedStatus!: string;
  @ApiProperty() unresolvedCount!: number;
}

export class NotificationReadEventDto {
  @ApiProperty({
    type: [String],
    description: 'ids that transitioned to read by this action',
  })
  ids!: string[];
  @ApiProperty() unreadCount!: number;
}
