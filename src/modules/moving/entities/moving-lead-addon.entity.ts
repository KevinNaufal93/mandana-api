import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MovingLead } from './moving-lead.entity';

/**
 * One priced add-on line snapshotted onto a MovingLead at submission time —
 * same rationale as EventBookingItem's snapshotted fields: a later catalog
 * price change must never rewrite a past lead's numbers. No FK to
 * MovingAddon (see MovingLead's doc comment for why).
 */
@Entity('moving_lead_addons')
export class MovingLeadAddon extends BaseEntity {
  @ManyToOne(() => MovingLead, (lead) => lead.addons, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead!: MovingLead;

  @Column({ name: 'lead_id' })
  leadId!: string;

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
