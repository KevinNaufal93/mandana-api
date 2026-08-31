import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { EventOverThresholdMode } from '../enums/event-over-threshold-mode.enum';

/**
 * Singleton row holding the Event Support hourly-pricing policy — every
 * commercial rule `event-support-hourly-pricing-requirements.md` §6 flags
 * as needing ops sign-off, made admin-editable instead of hardcoded so ops
 * can tune it without a deploy. Same pattern as MovingSettings — see
 * moving-settings.entity.ts and docs/moving-integration.md.
 *
 * `singleton` + its UNIQUE constraint + a DB-level CHECK (singleton = true)
 * make a second row physically impossible — see the migration.
 */
@Entity('event_support_settings')
export class EventSupportSettings extends BaseEntity {
  @Column({ default: true })
  singleton!: boolean;

  // §6.1 — the hourly/daily cutoff and whether it's inclusive.
  @Column({ name: 'hourly_threshold_hours', type: 'int', default: 24 })
  hourlyThresholdHours!: number;

  @Column({
    name: 'hourly_threshold_inclusive',
    type: 'boolean',
    default: true,
  })
  hourlyThresholdInclusive!: boolean;

  // §6.3 — fallback for EventItem.minimumHours when an item sets none.
  @Column({ name: 'default_minimum_hours', type: 'int', default: 2 })
  defaultMinimumHours!: number;

  // §6.4 — billable-hours rounding step.
  @Column({ name: 'rounding_unit_minutes', type: 'int', default: 30 })
  roundingUnitMinutes!: number;

  // §6.2 — an hourly line total never exceeds pricePerDay * quantity.
  @Column({ name: 'cap_hourly_at_daily_rate', type: 'boolean', default: true })
  capHourlyAtDailyRate!: boolean;

  // §6.5 — how a daily-billed window that isn't a whole number of days prices.
  @Column({
    name: 'over_threshold_mode',
    type: 'enum',
    enum: EventOverThresholdMode,
    default: EventOverThresholdMode.WHOLE_DAYS,
  })
  overThresholdMode!: EventOverThresholdMode;

  // §6.6 — ongkir / delivery-area disclosure.
  @Column({
    name: 'price_includes_jabodetabek_delivery',
    type: 'boolean',
    default: true,
  })
  priceIncludesJabodetabekDelivery!: boolean;

  @Column({ name: 'outside_jabodetabek_note', type: 'text', nullable: true })
  outsideJabodetabekNote!: string | null;
}
