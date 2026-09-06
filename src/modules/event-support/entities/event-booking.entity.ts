import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { EventBookingStatus } from '../enums/event-booking-status.enum';
import { EventBookingSource } from '../enums/event-booking-source.enum';
import { EventBookingItem } from './event-booking-item.entity';
import { User } from '../../users/entities/user.entity';
import { naiveLocalDateTimeTransformer } from './naive-datetime.transformer';

/**
 * An event-support booking, submitted either by a customer directly
 * (`source: 'public'`, via POST /event-support/bookings, `createdBy: null`)
 * or recorded by an admin after a WhatsApp conversation (`source: 'admin'`,
 * `createdBy` set from `@CurrentUser()`). Either way, pricing is always
 * recomputed server-side — never trusted from the request.
 *
 * `startDate`/`endDate` are the min/max across `items`, denormalized here
 * purely so the admin list can filter/sort by event window without joining.
 */
@Entity('event_bookings')
export class EventBooking extends BaseEntity {
  @Column({ unique: true, length: 20 })
  reference!: string;

  @Column({ name: 'customer_name', length: 255 })
  customerName!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({
    name: 'event_location',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  eventLocation!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  // Naive local datetime (Asia/Jakarta by convention) — the min/max across
  // `items`, same denormalization rationale as startDate/endDate above.
  // startDate/endDate stay authoritative for availability; these are the
  // actual drop-off/pickup instants for display. See
  // naive-datetime.transformer.ts for why this round-trips as a plain
  // string rather than `Date`.
  @Column({
    name: 'dropoff_at',
    type: 'timestamp',
    nullable: true,
    transformer: naiveLocalDateTimeTransformer,
  })
  dropoffAt!: string | null;

  @Column({
    name: 'pickup_at',
    type: 'timestamp',
    nullable: true,
    transformer: naiveLocalDateTimeTransformer,
  })
  pickupAt!: string | null;

  @Column({
    type: 'enum',
    enum: EventBookingStatus,
    default: EventBookingStatus.PENDING,
  })
  status!: EventBookingStatus;

  @Column({
    type: 'enum',
    enum: EventBookingSource,
    default: EventBookingSource.ADMIN,
  })
  source!: EventBookingSource;

  @Column({ type: 'int' })
  subtotal!: number;

  @Column({ name: 'discount_amount', type: 'int', default: 0 })
  discountAmount!: number;

  @Column({ type: 'int' })
  total!: number;

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User | null;

  @Column({ name: 'created_by_id', nullable: true, type: 'uuid' })
  createdById!: string | null;

  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt!: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'confirmed_by_id' })
  confirmedBy!: User | null;

  @Column({ name: 'confirmed_by_id', nullable: true, type: 'uuid' })
  confirmedById!: string | null;

  @OneToMany(() => EventBookingItem, (item) => item.booking, { cascade: true })
  items!: EventBookingItem[];
}
