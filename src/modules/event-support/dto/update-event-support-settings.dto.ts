import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Body for PATCH /admin/event-support/settings — the ops-owned
 * delivery-area disclosure. All optional, same convention as
 * moving/dto/update-moving-settings.dto.ts. This DTO used to also carry
 * the flexible-hourly-pricing policy (threshold, rounding step, minimum
 * hours, over-threshold mode) — removed along with that feature; see
 * migration 1788600000000-ReplaceEventHourlyWithEightHourPricing. */
export class UpdateEventSupportSettingsDto {
  @ApiPropertyOptional({
    example: true,
    description:
      'Whether pricePerDay/eightHourRate already include Jabodetabek delivery.',
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
