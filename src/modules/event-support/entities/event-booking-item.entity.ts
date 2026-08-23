import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { EventBooking } from './event-booking.entity';
import { EventItem } from './event-item.entity';

/**
 * One rented line within a booking — one item, its own date range and
 * quantity (a cart can mix a 2-day sound package with a 1-day DJ set).
 * `item` is RESTRICT, not CASCADE (unlike `booking`, which owns its lines):
 * a booking is a historical/financial record that must not silently vanish
 * or get orphaned if an item is later deleted — same rationale as
 * StorageBooking.facility. `itemName`/`pricePerDay` are snapshotted so a
 * later rename or price change never rewrites a past booking.
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

  // Rupiah as integer, snapshotted from EventItem.pricePerDay at booking time.
  @Column({ name: 'price_per_day', type: 'int' })
  pricePerDay!: number;

  @Column({ name: 'line_total', type: 'int' })
  lineTotal!: number;
}
