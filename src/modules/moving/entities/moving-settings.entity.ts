import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Singleton row holding the Moving Support pricing policy — the rounding
 * step, the upward price-band headroom percentage shown above the total to
 * the customer (lowEstimate = total, highEstimate = total * (1 + bandPct/100)
 * rounded up), and the
 * fallback included-km when a truck class doesn't set its own. Previously
 * hardcoded as MOVING_DEFAULTS in moving-pricing.ts and mirrored
 * byte-for-byte into the frontend; now served over GET /moving/pricing-config
 * so the FE fetches the numbers instead of hardcoding them too. See
 * moving-pricing.ts and docs/moving-integration.md.
 *
 * `singleton` + its UNIQUE constraint + a DB-level CHECK (singleton = true)
 * make a second row physically impossible — see the migration.
 */
@Entity('moving_settings')
export class MovingSettings extends BaseEntity {
  @Column({ default: true })
  singleton!: boolean;

  @Column({ name: 'round_to_idr', type: 'int', default: 10_000 })
  roundToIdr!: number;

  @Column({ name: 'band_pct', type: 'int', default: 10 })
  bandPct!: number;

  @Column({ name: 'default_included_km', type: 'int', default: 5 })
  defaultIncludedKm!: number;
}
