import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MovingBooking } from './moving-booking.entity';

/**
 * One ordered destination within a MovingBooking — a move can have any
 * number of stops, not just one (see docs/moving-integration.md).
 * `stopIndex` is the 0-based route order the customer configured. Pricing
 * itself stays distance-agnostic-to-route-shape (`MovingBooking.distanceKm`
 * is still the single total the customer's own client-computed route
 * produced) — this table exists purely to preserve the record, not to drive
 * per-leg pricing.
 */
@Entity('moving_booking_stops')
@Index('idx_moving_booking_stops_booking_index', ['bookingId', 'stopIndex'])
export class MovingBookingStop extends BaseEntity {
  @ManyToOne(() => MovingBooking, (booking) => booking.stops, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'booking_id' })
  booking!: MovingBooking;

  @Column({ name: 'booking_id' })
  bookingId!: string;

  @Column({ name: 'stop_index', type: 'int' })
  stopIndex!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address!: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6 })
  lat!: number;

  @Column({ type: 'numeric', precision: 9, scale: 6 })
  lng!: number;
}
