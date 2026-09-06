import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MovingBooking } from './moving-booking.entity';

/**
 * One priced add-on line snapshotted onto a MovingBooking at submission
 * time — same rationale as EventBookingItem's snapshotted fields: a later
 * catalog price change must never rewrite a past booking's numbers. No FK
 * to MovingAddon (see MovingBooking's doc comment for why).
 */
@Entity('moving_booking_addons')
export class MovingBookingAddon extends BaseEntity {
  @ManyToOne(() => MovingBooking, (booking) => booking.addons, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'booking_id' })
  booking!: MovingBooking;

  @Column({ name: 'booking_id' })
  bookingId!: string;

  @Column({ name: 'addon_slug', length: 150 })
  addonSlug!: string;

  @Column({ name: 'addon_name', length: 150 })
  addonName!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'unit_price', type: 'int' })
  unitPrice!: number;

  @Column({ type: 'int' })
  amount!: number;
}
