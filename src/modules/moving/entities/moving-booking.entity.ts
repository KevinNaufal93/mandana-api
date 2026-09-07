import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MovingBookingStatus } from '../enums/moving-booking-status.enum';
import { MovingBookingStop } from './moving-booking-stop.entity';
import { MovingBookingAddon } from './moving-booking-addon.entity';
import { MovingBookingLeg } from './moving-booking-leg.entity';
import { User } from '../../users/entities/user.entity';

/**
 * A captured Moving Support booking — persisted the moment a customer clicks
 * "Pesan via WhatsApp", before the real conversation/confirmation happens
 * over WhatsApp with a human (see docs/moving-integration.md). Every price
 * field is a snapshot recomputed server-side via `MovingService.buildQuote()`
 * at submission time (never trust a client-sent total), same rationale as
 * EventBookingItem's snapshotted `itemName`/`pricePerDay`: a later catalog
 * rate change must never rewrite a past booking's numbers.
 *
 * No FK to TruckClass/MovingAddon: unlike EventItem, both have real
 * hard-delete admin endpoints (MovingService.remove(),
 * MovingAddonsService.remove()), so a RESTRICT FK here would block catalog
 * cleanup forever — `truckSlug`/`truckName` and each `MovingBookingAddon` row
 * are self-contained snapshots instead.
 *
 * `status` mirrors StorageBookingStatus (pending/confirmed/rejected/
 * cancelled/completed) even though nothing here is reserved — see
 * MovingBookingsService for why `confirm`/`reject`/`cancel`/`complete` are
 * pure status writes with no locking or availability re-check.
 */
@Entity('moving_bookings')
export class MovingBooking extends BaseEntity {
  @Column({ unique: true, length: 20 })
  reference!: string;

  @Column({
    type: 'enum',
    enum: MovingBookingStatus,
    default: MovingBookingStatus.PENDING,
  })
  status!: MovingBookingStatus;

  @Column({ name: 'truck_slug', length: 100 })
  truckSlug!: string;

  @Column({ name: 'truck_name', length: 100 })
  truckName!: string;

  @Column({
    name: 'pickup_address',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  pickupAddress!: string | null;

  @Column({ name: 'pickup_lat', type: 'numeric', precision: 9, scale: 6 })
  pickupLat!: number;

  @Column({ name: 'pickup_lng', type: 'numeric', precision: 9, scale: 6 })
  pickupLng!: number;

  @Column({ name: 'distance_km', type: 'numeric', precision: 7, scale: 1 })
  distanceKm!: number;

  @Column({ name: 'included_km', type: 'int' })
  includedKm!: number;

  @Column({ name: 'chargeable_km', type: 'numeric', precision: 7, scale: 1 })
  chargeableKm!: number;

  // Nullable: NULL means this booking was captured before 500 m step
  // pricing shipped (priced per km) — a step count does not apply to it,
  // and back-filling one from chargeable_km would fabricate history (see
  // moving-pricing.ts). Every booking created after that release writes a
  // real integer here.
  @Column({ name: 'chargeable_steps', type: 'int', nullable: true })
  chargeableSteps!: number | null;

  @Column({ name: 'round_trip', default: false })
  roundTrip!: boolean;

  @Column({ name: 'toll_route', default: true })
  tollRoute!: boolean;

  @Column({ name: 'declared_value', type: 'int', nullable: true })
  declaredValue!: number | null;

  @Column({ name: 'base_fare', type: 'int' })
  baseFare!: number;

  @Column({ name: 'distance_fare', type: 'int' })
  distanceFare!: number;

  @Column({ name: 'travel_subtotal', type: 'int' })
  travelSubtotal!: number;

  @Column({ name: 'toll_fare', type: 'int', default: 0 })
  tollFare!: number;

  @Column({ name: 'addons_total', type: 'int', default: 0 })
  addonsTotal!: number;

  @Column({ type: 'int' })
  subtotal!: number;

  @Column({ type: 'int' })
  total!: number;

  @Column({ name: 'low_estimate', type: 'int' })
  lowEstimate!: number;

  @Column({ name: 'high_estimate', type: 'int' })
  highEstimate!: number;

  @Column({ name: 'min_fare_applied', default: false })
  minFareApplied!: boolean;

  // Not currently collected by the mandana-web page — all nullable,
  // future-proofing for whenever the form grows contact fields.
  @Column({
    name: 'customer_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  customerName!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  // Customer-provided free text ("Additional notes" on the web form) — e.g.
  // "barang mudah pecah", "butuh 2 orang angkat ke lantai 3". Distinct from
  // `adminNote` below, which is staff-internal and never customer-supplied.
  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote!: string | null;

  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt!: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'confirmed_by_id' })
  confirmedBy!: User | null;

  @Column({ name: 'confirmed_by_id', nullable: true, type: 'uuid' })
  confirmedById!: string | null;

  @OneToMany(() => MovingBookingStop, (stop) => stop.booking, {
    cascade: true,
  })
  stops!: MovingBookingStop[];

  @OneToMany(() => MovingBookingAddon, (addon) => addon.booking, {
    cascade: true,
  })
  addons!: MovingBookingAddon[];

  @OneToMany(() => MovingBookingLeg, (leg) => leg.booking, { cascade: true })
  legs!: MovingBookingLeg[];
}
