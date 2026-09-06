import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { NotificationSourceModule } from '../enums/notification-source-module.enum';
import { NotificationOrigin } from '../enums/notification-origin.enum';

/**
 * One row per booking a customer (or, for Event Support's WhatsApp path, an
 * admin) creates in Moving / Storage / Event Support — the source data for
 * the web-admin notification bell. Deliberately NOT FK'd to any of the three
 * booking tables (there is no single table it could point at); `sourceId`
 * is a plain, unenforced uuid. `NotificationsService.resolveForBooking()` is
 * a no-op when the row it names doesn't exist — true for every booking
 * created before this feature shipped, since there is no backfill.
 *
 * `reference`/`customerName`/`total` are denormalized so the feed renders
 * from this one table with no cross-module joins — the same reasoning
 * behind `StorageBookingCreatedEventDto`.
 *
 * `readAt` and `resolvedAt` are deliberately two separate, independent
 * columns — that separation is the entire feature. Opening the bell only
 * ever touches `readAt` (and it's global/shared by product decision, not
 * per-admin — a single column, not a join table). Only a booking actually
 * leaving `pending` (confirm/reject/cancel/complete) touches `resolvedAt` —
 * see each module's booking service for the call site.
 */
@Entity('admin_notifications')
@Unique('UQ_admin_notifications_source', ['sourceModule', 'sourceId'])
export class AdminNotification extends BaseEntity {
  @Column({
    name: 'source_module',
    type: 'enum',
    enum: NotificationSourceModule,
  })
  sourceModule!: NotificationSourceModule;

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId!: string;

  @Column({ length: 20 })
  reference!: string;

  // Nullable: MovingBooking.customerName itself allows null.
  @Column({
    name: 'customer_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  customerName!: string | null;

  @Column({ type: 'int' })
  total!: number;

  @Column({
    type: 'enum',
    enum: NotificationOrigin,
    default: NotificationOrigin.CUSTOMER,
  })
  origin!: NotificationOrigin;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  // Free-text, not an enum column: the three source modules have three
  // different (and not identical — Event Support has no `rejected`) status
  // enums, so this stores whichever one's string value the booking landed
  // on rather than trying to unify them into a fourth Postgres enum type.
  @Column({
    name: 'resolved_status',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  resolvedStatus!: string | null;
}
