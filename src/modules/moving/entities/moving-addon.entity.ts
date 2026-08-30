import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MediaAsset } from '../../media/entities/media-asset.entity';
import { MovingAddonKind } from '../enums/moving-addon-kind.enum';
import { MovingAddonPricingModel } from '../enums/moving-addon-pricing-model.enum';

/**
 * A configurable fee line the Moving Support quote can add on top of the
 * truck's base + distance fare — helper, packaging, extra waiting time,
 * insurance, and the toll estimate. One catalog table with a pricing-model
 * enum instead of fixed columns on TruckClass, so ops can reprice or add a
 * new fee from the admin panel with no deploy — mirrors EventItem.
 *
 * `kind === 'toll'` rows are never client-selectable (see
 * MovingAddonKind.TOLL); MovingService applies the single active one from
 * `QuoteMovingDto.tollRoute`. See moving-pricing.ts for the per-model math.
 */
@Entity('moving_addons')
export class MovingAddon extends BaseEntity {
  @Column({ length: 150 })
  name!: string;

  @Column({ unique: true, length: 150 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enum: MovingAddonKind })
  kind!: MovingAddonKind;

  @Column({
    name: 'pricing_model',
    type: 'enum',
    enum: MovingAddonPricingModel,
  })
  pricingModel!: MovingAddonPricingModel;

  // Rupiah as integer — same rationale as TruckClass.baseFare. Used by the
  // `flat` and `per_unit` pricing models; ignored by `percent`.
  @Column({ name: 'unit_price', type: 'int', default: 0 })
  unitPrice!: number;

  // Basis points (20 = 0.2%) so the `percent` model never leaks a `numeric`
  // string like Property.price does — see TruckClass.volumeM3's comment.
  @Column({ name: 'percent_bps', type: 'int', nullable: true })
  percentBps!: number | null;

  @Column({ name: 'min_charge', type: 'int', nullable: true })
  minCharge!: number | null;

  @Column({ name: 'max_charge', type: 'int', nullable: true })
  maxCharge!: number | null;

  @Column({ name: 'unit_label', type: 'varchar', length: 30, nullable: true })
  unitLabel!: string | null;

  @Column({ name: 'min_qty', type: 'int', default: 1 })
  minQty!: number;

  @Column({ name: 'max_qty', type: 'int', default: 10 })
  maxQty!: number;

  // Only meaningful for `per_unit`/`flat` add-ons and the `toll` row itself
  // — a round trip means the crew/goods travel once but the road (and its
  // toll) is driven twice. False for every non-toll seeded row.
  @Column({ name: 'doubles_on_round_trip', default: false })
  doublesOnRoundTrip!: boolean;

  @ManyToOne(() => MediaAsset, {
    nullable: true,
    eager: false,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'media_asset_id' })
  mediaAsset!: MediaAsset | null;

  @Column({ name: 'media_asset_id', nullable: true })
  mediaAssetId!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;
}
