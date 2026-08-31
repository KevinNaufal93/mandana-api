import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventSupportSettings } from './entities/event-support-settings.entity';
import { UpdateEventSupportSettingsDto } from './dto/update-event-support-settings.dto';
import { EVENT_PRICING_DEFAULTS } from './event-pricing';

/**
 * Reads/writes the Event Support hourly-pricing-policy singleton. See
 * event-support-settings.entity.ts and event-pricing.ts for what each
 * field controls, and event-support-hourly-pricing-requirements.md §6 for
 * why these are ops-owned commercial decisions rather than constants.
 */
@Injectable()
export class EventSupportSettingsService {
  constructor(
    @InjectRepository(EventSupportSettings)
    private readonly repo: Repository<EventSupportSettings>,
  ) {}

  /** Loads the singleton row, seeding it on first read if the migration's
   * seed somehow didn't run (e.g. a DB restored before this migration) —
   * a quote must never 500 for missing pricing config. */
  async get(): Promise<EventSupportSettings> {
    const existing = await this.repo.findOne({ where: { singleton: true } });
    if (existing) return existing;

    const created = this.repo.create({
      singleton: true,
      hourlyThresholdHours: EVENT_PRICING_DEFAULTS.hourlyThresholdHours,
      hourlyThresholdInclusive: EVENT_PRICING_DEFAULTS.hourlyThresholdInclusive,
      defaultMinimumHours: EVENT_PRICING_DEFAULTS.defaultMinimumHours,
      roundingUnitMinutes: EVENT_PRICING_DEFAULTS.roundingUnitMinutes,
      capHourlyAtDailyRate: EVENT_PRICING_DEFAULTS.capHourlyAtDailyRate,
      overThresholdMode: EVENT_PRICING_DEFAULTS.overThresholdMode,
      priceIncludesJabodetabekDelivery: true,
      outsideJabodetabekNote: null,
    });
    return this.repo.save(created);
  }

  async update(
    dto: UpdateEventSupportSettingsDto,
  ): Promise<EventSupportSettings> {
    const settings = await this.get();

    Object.assign(settings, {
      ...(dto.hourlyThresholdHours !== undefined && {
        hourlyThresholdHours: dto.hourlyThresholdHours,
      }),
      ...(dto.hourlyThresholdInclusive !== undefined && {
        hourlyThresholdInclusive: dto.hourlyThresholdInclusive,
      }),
      ...(dto.defaultMinimumHours !== undefined && {
        defaultMinimumHours: dto.defaultMinimumHours,
      }),
      ...(dto.roundingUnitMinutes !== undefined && {
        roundingUnitMinutes: dto.roundingUnitMinutes,
      }),
      ...(dto.capHourlyAtDailyRate !== undefined && {
        capHourlyAtDailyRate: dto.capHourlyAtDailyRate,
      }),
      ...(dto.overThresholdMode !== undefined && {
        overThresholdMode: dto.overThresholdMode,
      }),
      ...(dto.priceIncludesJabodetabekDelivery !== undefined && {
        priceIncludesJabodetabekDelivery: dto.priceIncludesJabodetabekDelivery,
      }),
      ...(dto.outsideJabodetabekNote !== undefined && {
        outsideJabodetabekNote: dto.outsideJabodetabekNote ?? null,
      }),
    });

    return this.repo.save(settings);
  }

  /** Shape the pure pricing math (event-pricing.ts) expects — strips
   * id/singleton/timestamps/ongkir fields the pricing functions don't use. */
  toPricingPolicy(settings: EventSupportSettings) {
    return {
      hourlyThresholdHours: settings.hourlyThresholdHours,
      hourlyThresholdInclusive: settings.hourlyThresholdInclusive,
      defaultMinimumHours: settings.defaultMinimumHours,
      roundingUnitMinutes: settings.roundingUnitMinutes,
      capHourlyAtDailyRate: settings.capHourlyAtDailyRate,
      overThresholdMode: settings.overThresholdMode,
    };
  }
}
