import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MovingLeadStatus } from '../enums/moving-lead-status.enum';
import { MovingLeadStop } from './moving-lead-stop.entity';
import { MovingLeadAddon } from './moving-lead-addon.entity';

/**
 * A captured Moving Support lead — persisted the moment a customer clicks
 * "Pesan via WhatsApp", before the real conversation/confirmation happens
 * over WhatsApp with a human (see docs/moving-integration.md). Every price
 * field is a snapshot recomputed server-side via `MovingService.buildQuote()`
 * at submission time (never trust a client-sent total), same rationale as
 * EventBookingItem's snapshotted `itemName`/`pricePerDay`: a later catalog
 * rate change must never rewrite a past lead's numbers.
 *
 * No FK to TruckClass/MovingAddon: unlike EventItem, both have real
 * hard-delete admin endpoints (MovingService.remove(),
 * MovingAddonsService.remove()), so a RESTRICT FK here would block catalog
 * cleanup forever — `truckSlug`/`truckName` and each `MovingLeadAddon` row
 * are self-contained snapshots instead.
 *
 * `status` is pure CRM triage — no side-effecting state machine, since
 * nothing here is reserved (unlike StorageBooking/EventBooking's
 * confirm/cancel flow, which gate real inventory).
 */
@Entity('moving_leads')
export class MovingLead extends BaseEntity {
  @Column({ unique: true, length: 20 })
  reference!: string;

  @Column({
    type: 'enum',
    enum: MovingLeadStatus,
    default: MovingLeadStatus.NEW,
  })
  status!: MovingLeadStatus;

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

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote!: string | null;

  @OneToMany(() => MovingLeadStop, (stop) => stop.lead, { cascade: true })
  stops!: MovingLeadStop[];

  @OneToMany(() => MovingLeadAddon, (addon) => addon.lead, { cascade: true })
  addons!: MovingLeadAddon[];
}
