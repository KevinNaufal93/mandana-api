import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Singleton row holding the property-listing settings ops can edit without
 * a deploy: today just the KPR (mortgage) simulator's fixed interest rate
 * and tenor on the public property detail page. The rate is stored as basis
 * points (1.75% = 175), the same convention moving add-ons use for
 * percentages, so it is a plain integer end to end.
 *
 * `singleton` + its UNIQUE constraint + a DB-level CHECK (singleton = true)
 * make a second row physically impossible; see the migration.
 */
@Entity('property_settings')
export class PropertySettings extends BaseEntity {
  @Column({ default: true })
  singleton!: boolean;

  @Column({ name: 'kpr_annual_rate_bps', type: 'int', default: 175 })
  kprAnnualRateBps!: number;

  @Column({ name: 'kpr_tenor_years', type: 'int', default: 25 })
  kprTenorYears!: number;
}
