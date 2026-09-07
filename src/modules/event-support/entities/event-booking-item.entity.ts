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
 * meaningful under 8-hour-block billing (a same-day rental still reads
 * `days: 1`). `billingMode`/`unitPrice`/`unitLabel`/`billableUnits` record
 * which rate actually applied at booking time, mirroring the quote line
 * shape in EventQuoteLineDto — `billableUnits` is always a whole number
 * now (1 block, or N days).
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

  // The rate actually applied — eightHourRate when billingMode is
  // 'eight_hour', pricePerDay otherwise. Redundant with pricePerDay in the
  // daily case, kept so this row's math is self-contained without
  // cross-referencing.
  @Column({ name: 'unit_price', type: 'int', default: 0 })
  unitPrice!: number;

  @Column({ name: 'unit_label', type: 'varchar', length: 10, default: 'hari' })
  unitLabel!: '8 jam' | 'hari';

  // Always 1 under 'eight_hour' billing (one block); the whole-day count
  // under 'daily'. Plain int — the fractional hourly figures this column
  // used to carry (30-minute rounding steps) are gone along with flexible
  // hourly billing.
  @Column({ name: 'billable_units', type: 'int', default: 0 })
  billableUnits!: number;

  @Column({ name: 'line_total', type: 'int' })
  lineTotal!: number;
}
