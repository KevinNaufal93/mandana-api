import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Singleton row holding Event Support's ops-editable commercial policy.
 * It used to also carry the flexible-hourly-pricing policy (threshold,
 * rounding step, minimum hours, a day_plus_hourly remainder mode) from a
 * short-lived feature; that was replaced by a fixed 8-hour rental block
 * with no tunable knobs (see event-pricing.ts and migration
 * 1788600000000-ReplaceEventHourlyWithEightHourPricing), so this row is
 * now just the delivery-area disclosure. Same pattern as MovingSettings —
 * see moving-settings.entity.ts and docs/moving-integration.md.
 *
 * `singleton` + its UNIQUE constraint + a DB-level CHECK (singleton = true)
 * make a second row physically impossible — see the migration.
 */
@Entity('event_support_settings')
export class EventSupportSettings extends BaseEntity {
  @Column({ default: true })
  singleton!: boolean;

  // Delivery-area disclosure shown on the quote's WhatsApp message.
  @Column({
    name: 'price_includes_jabodetabek_delivery',
    type: 'boolean',
    default: true,
  })
  priceIncludesJabodetabekDelivery!: boolean;

  @Column({ name: 'outside_jabodetabek_note', type: 'text', nullable: true })
  outsideJabodetabekNote!: string | null;
}
