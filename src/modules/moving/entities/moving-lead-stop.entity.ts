import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MovingLead } from './moving-lead.entity';

/**
 * One ordered destination within a MovingLead — a move can have any number
 * of stops, not just one (see docs/moving-integration.md). `stopIndex` is
 * the 0-based route order the customer configured. Pricing itself stays
 * distance-agnostic-to-route-shape (`MovingLead.distanceKm` is still the
 * single total the customer's own client-computed route produced) — this
 * table exists purely to preserve the record, not to drive per-leg pricing.
 */
@Entity('moving_lead_stops')
@Index('idx_moving_lead_stops_lead_index', ['leadId', 'stopIndex'])
export class MovingLeadStop extends BaseEntity {
  @ManyToOne(() => MovingLead, (lead) => lead.stops, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead!: MovingLead;

  @Column({ name: 'lead_id' })
  leadId!: string;

  @Column({ name: 'stop_index', type: 'int' })
  stopIndex!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address!: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6 })
  lat!: number;

  @Column({ type: 'numeric', precision: 9, scale: 6 })
  lng!: number;
}
