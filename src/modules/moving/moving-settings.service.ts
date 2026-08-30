import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MovingSettings } from './entities/moving-settings.entity';
import { UpdateMovingSettingsDto } from './dto/update-moving-settings.dto';
import { MOVING_DEFAULTS } from './moving-pricing';

/**
 * Reads/writes the Moving Support pricing-policy singleton (roundToIdr,
 * bandPct, defaultIncludedKm). See moving-settings.entity.ts and
 * moving-pricing.ts for why this replaced the hardcoded MOVING_DEFAULTS.
 */
@Injectable()
export class MovingSettingsService {
  constructor(
    @InjectRepository(MovingSettings)
    private readonly repo: Repository<MovingSettings>,
  ) {}

  /** Loads the singleton row, seeding it on first read if the migration's
   * seed somehow didn't run (e.g. a DB restored before this migration) —
   * a quote must never 500 for missing pricing config. */
  async get(): Promise<MovingSettings> {
    const existing = await this.repo.findOne({ where: { singleton: true } });
    if (existing) return existing;

    const created = this.repo.create({
      singleton: true,
      roundToIdr: MOVING_DEFAULTS.roundToIdr,
      bandPct: MOVING_DEFAULTS.bandPct,
      defaultIncludedKm: MOVING_DEFAULTS.includedKm,
    });
    return this.repo.save(created);
  }

  async update(dto: UpdateMovingSettingsDto): Promise<MovingSettings> {
    const settings = await this.get();

    Object.assign(settings, {
      ...(dto.roundToIdr !== undefined && { roundToIdr: dto.roundToIdr }),
      ...(dto.bandPct !== undefined && { bandPct: dto.bandPct }),
      ...(dto.defaultIncludedKm !== undefined && {
        defaultIncludedKm: dto.defaultIncludedKm,
      }),
    });

    return this.repo.save(settings);
  }
}
