import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { EventBooking } from './event-booking.entity';
import { EventItem } from './event-item.entity';
import { EventBillingMode } from '../enums/event-billing-mode.enum';
import { naiveLocalDateTimeTransformer } from './naive-datetime.transformer';

/**
 * One rented line within a booking — one item, its own rental window and
 * quantity (a cart can mix a 2-day sound package with a 1-day DJ set).
 * `item` is RESTRICT, not CASCADE (unlike `booking`, which owns its lines):
 * a booking is a historical/financial record that must not silently vanish
 * or get orphaned if an item is later deleted — same rationale as
 * StorageBooking.facility. `itemName`/`pricePerDay` are snapshotted so a
 * later rename or price change never rewrites a past booking.
 *
 * `startDate`/`endDate` stay authoritative for availability (see
 * EventAvailabilityService) and are derived from `dropoffAt`/`pickupAt` —
 * see event-pricing.ts's windowStartDate/windowEndDate. `days` is
 * repurposed as the calendar days held (`endDate - startDate + 1`), still
 * meaningful under hourly billing. `billingMode`/`unitPrice`/`unitLabel`/
 * `billableUnits` record which rate actually applied at booking time,
 * mirroring the quote line shape in EventQuoteLineDto.
 */
@Entity('event_booking_items')
@Index('idx_event_booking_items_item_dates', ['itemId', 'startDate', 'endDate'])
export class EventBookingItem extends BaseEntity {
  @ManyToOne(() => EventBooking, (booking) => booking.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'booking_id' })
  booking!: EventBooking;

  @Column({ name: 'booking_id' })
  bookingId!: string;

  @ManyToOne(() => EventItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  item!: EventItem;

  @Column({ name: 'item_id' })
  itemId!: string;

  @Column({ name: 'item_name', length: 180 })
  itemName!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ type: 'int' })
  days!: number;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

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
    name: 'billing_mode',
    type: 'enum',
    enum: EventBillingMode,
    default: EventBillingMode.DAILY,
  })
  billingMode!: EventBillingMode;

  // Rupiah as integer, snapshotted from EventItem.pricePerDay at booking time.
  @Column({ name: 'price_per_day', type: 'int' })
  pricePerDay!: number;

  // The rate actually applied — hourlyRate when billingMode is 'hourly',
  // pricePerDay otherwise. Redundant with pricePerDay in the daily case,
  // kept so this row's math is self-contained without cross-referencing.
  @Column({ name: 'unit_price', type: 'int', default: 0 })
  unitPrice!: number;

  @Column({ name: 'unit_label', type: 'varchar', length: 10, default: 'hari' })
  unitLabel!: 'jam' | 'hari';

  // numeric — comes back from `pg` as a string at runtime despite the
  // `number` type below (same quirk as TruckClass.volumeM3); the mapper's
  // toNumber() coerces it before it reaches the response.
  @Column({
    name: 'billable_units',
    type: 'numeric',
    precision: 8,
    scale: 2,
    default: 0,
  })
  billableUnits!: number;

  @Column({
    name: 'extra_hours',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  extraHours!: number | null;

  @Column({ name: 'extra_hours_total', type: 'int', nullable: true })
  extraHoursTotal!: number | null;

  @Column({ name: 'line_total', type: 'int' })
  lineTotal!: number;
}
