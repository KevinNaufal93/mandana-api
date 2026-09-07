import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MovingBooking } from './moving-booking.entity';

/**
 * One priced leg (pickup→stop1, stop1→stop2, ...) within a MovingBooking's
 * route — snapshotted from the already-priced MovingQuoteResult.legs[]
 * breakdown at submission time, same rationale as MovingBookingAddon (a
 * later rate-card change must never rewrite a past booking's numbers).
 * `legIndex` is the 0-based leg order — NOT the same array index as
 * MovingBookingStop's `stopIndex` (a round-trip booking can have one more
 * leg than stop: the explicit return leg, last stop → pickup — see
 * MovingBookingsService.create()'s legs-vs-destinations cross-validation).
 *
 * `subtotal` here is this leg's own `baseFare + distanceFare`, distinct
 * from `MovingBooking.travelSubtotal`, which is the trip-wide sum across
 * every leg after the minFare floor. There is deliberately no per-leg
 * `minFareApplied` column — minFare floors the trip-wide sum once, never
 * per leg (see moving-pricing.ts and docs/moving-integration.md).
 */
@Entity('moving_booking_legs')
@Index('idx_moving_booking_legs_booking_index', ['bookingId', 'legIndex'])
export class MovingBookingLeg extends BaseEntity {
  @ManyToOne(() => MovingBooking, (booking) => booking.legs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'booking_id' })
  booking!: MovingBooking;

  @Column({ name: 'booking_id' })
  bookingId!: string;

  @Column({ name: 'leg_index', type: 'int' })
  legIndex!: number;

  @Column({ name: 'distance_km', type: 'numeric', precision: 7, scale: 1 })
  distanceKm!: number;

  @Column({ name: 'included_km', type: 'int' })
  includedKm!: number;

  @Column({ name: 'chargeable_km', type: 'numeric', precision: 7, scale: 1 })
  chargeableKm!: number;

  // Nullable: NULL on a leg priced before 500 m step pricing shipped — see
  // the identical column on MovingBooking for the full rationale.
  @Column({ name: 'chargeable_steps', type: 'int', nullable: true })
  chargeableSteps!: number | null;

  @Column({ name: 'base_fare', type: 'int' })
  baseFare!: number;

  @Column({ name: 'distance_fare', type: 'int' })
  distanceFare!: number;

  @Column({ type: 'int' })
  subtotal!: number;
}
