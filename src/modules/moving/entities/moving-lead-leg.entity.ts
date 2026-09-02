import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MovingLead } from './moving-lead.entity';

/**
 * One priced leg (pickup→stop1, stop1→stop2, ...) within a MovingLead's
 * route — snapshotted from the already-priced MovingQuoteResult.legs[]
 * breakdown at submission time, same rationale as MovingLeadAddon (a later
 * rate-card change must never rewrite a past lead's numbers). `legIndex` is
 * the 0-based leg order — NOT the same array index as MovingLeadStop's
 * `stopIndex` (a round-trip lead can have one more leg than stop: the
 * explicit return leg, last stop → pickup — see
 * MovingLeadsService.create()'s legs-vs-destinations cross-validation).
 *
 * `subtotal` here is this leg's own `baseFare + distanceFare`, distinct
 * from `MovingLead.travelSubtotal`, which is the trip-wide sum across every
 * leg after the minFare floor. There is deliberately no per-leg
 * `minFareApplied` column — minFare floors the trip-wide sum once, never
 * per leg (see moving-pricing.ts and docs/moving-integration.md).
 */
@Entity('moving_lead_legs')
@Index('idx_moving_lead_legs_lead_index', ['leadId', 'legIndex'])
export class MovingLeadLeg extends BaseEntity {
  @ManyToOne(() => MovingLead, (lead) => lead.legs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead!: MovingLead;

  @Column({ name: 'lead_id' })
  leadId!: string;

  @Column({ name: 'leg_index', type: 'int' })
  legIndex!: number;

  @Column({ name: 'distance_km', type: 'numeric', precision: 7, scale: 1 })
  distanceKm!: number;

  @Column({ name: 'included_km', type: 'int' })
  includedKm!: number;

  @Column({ name: 'chargeable_km', type: 'numeric', precision: 7, scale: 1 })
  chargeableKm!: number;

  @Column({ name: 'base_fare', type: 'int' })
  baseFare!: number;

  @Column({ name: 'distance_fare', type: 'int' })
  distanceFare!: number;

  @Column({ type: 'int' })
  subtotal!: number;
}
