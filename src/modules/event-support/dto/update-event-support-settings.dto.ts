import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EventOverThresholdMode } from '../enums/event-over-threshold-mode.enum';

/** Body for PATCH /admin/event-support/settings — every field is the
 * ops-owned commercial policy event-support-hourly-pricing-requirements.md
 * §6 calls out for sign-off. All optional, same convention as
 * moving/dto/update-moving-settings.dto.ts. */
export class UpdateEventSupportSettingsDto {
  @ApiPropertyOptional({
    example: 24,
    minimum: 1,
    maximum: 720,
    description: 'The hourly/daily cutoff, in hours (§6.1).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  hourlyThresholdHours?: number;

  @ApiPropertyOptional({
    example: true,
    description:
      'Whether a window exactly at hourlyThresholdHours still bills hourly (<=) or falls to daily (<).',
  })
  @IsOptional()
  @IsBoolean()
  hourlyThresholdInclusive?: boolean;

  @ApiPropertyOptional({
    example: 2,
    minimum: 0,
    maximum: 24,
    description:
      'Fallback minimum billable hours when an item sets no minimumHours of its own (§6.3).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24)
  defaultMinimumHours?: number;

  @ApiPropertyOptional({
    example: 30,
    minimum: 1,
    maximum: 60,
    description: 'Billable-hours rounding step, in minutes (§6.4).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  roundingUnitMinutes?: number;

  @ApiPropertyOptional({
    example: true,
    description:
      'When true, an hourly line total never exceeds pricePerDay * quantity (§6.2).',
  })
  @IsOptional()
  @IsBoolean()
  capHourlyAtDailyRate?: boolean;

  @ApiPropertyOptional({
    enum: EventOverThresholdMode,
    description:
      'How a daily-billed window that is not a whole number of days prices (§6.5).',
  })
  @IsOptional()
  @IsEnum(EventOverThresholdMode)
  overThresholdMode?: EventOverThresholdMode;

  @ApiPropertyOptional({
    example: true,
    description:
      'Whether pricePerDay/hourlyRate already include Jabodetabek delivery (§6.6).',
  })
  @IsOptional()
  @IsBoolean()
  priceIncludesJabodetabekDelivery?: boolean;

  @ApiPropertyOptional({
    example: 'Lokasi di luar Jabodetabek dikenakan biaya pengiriman tambahan.',
    description:
      'Shown on the quote when eventLocation looks like it is outside Jabodetabek. Null clears it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  outsideJabodetabekNote?: string | null;
}
