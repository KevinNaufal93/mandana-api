import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  WHATSAPP_NUMBER_MAX_LENGTH,
  WHATSAPP_NUMBER_MESSAGE,
  WHATSAPP_NUMBER_PATTERN,
  trimWhatsappNumber,
} from '../../../common/validation/whatsapp-number';

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

  @ApiPropertyOptional({
    example: '+6281234567890',
    description:
      'WhatsApp number for Mandana Living (Event Support). Exactly as typed (the website normalizes it). An empty string clears it, which makes the website fall back to the General number.',
  })
  @Transform(trimWhatsappNumber)
  @IsOptional()
  @IsString()
  @MaxLength(WHATSAPP_NUMBER_MAX_LENGTH)
  @Matches(WHATSAPP_NUMBER_PATTERN, { message: WHATSAPP_NUMBER_MESSAGE })
  whatsappNumber?: string;
}
