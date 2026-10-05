import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import {
  WHATSAPP_NUMBER_MAX_LENGTH,
  WHATSAPP_NUMBER_MESSAGE,
  WHATSAPP_NUMBER_PATTERN,
  trimWhatsappNumber,
} from '../../../common/validation/whatsapp-number';

export class UpdateMovingSettingsDto {
  @ApiPropertyOptional({
    example: 10000,
    minimum: 1,
    maximum: 1_000_000,
    description: 'Rounding step applied to the quote total, in Rupiah.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  roundToIdr?: number;

  @ApiPropertyOptional({
    example: 10,
    minimum: 0,
    maximum: 50,
    description:
      'Upward headroom above the total, as a percentage. The customer-facing band runs from the total (floor) to total * (1 + bandPct/100) rounded up. 0 = exact price.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  bandPct?: number;

  @ApiPropertyOptional({
    example: 5,
    minimum: 0,
    maximum: 100,
    description:
      'Fallback included-km used when a truck class does not set its own includedKm.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  defaultIncludedKm?: number;

  @ApiPropertyOptional({
    example: '+6281234567890',
    description:
      'WhatsApp number for Mandana Move. Exactly as typed (the website normalizes it). An empty string clears it, which makes the website fall back to the General number.',
  })
  @Transform(trimWhatsappNumber)
  @IsOptional()
  @IsString()
  @MaxLength(WHATSAPP_NUMBER_MAX_LENGTH)
  @Matches(WHATSAPP_NUMBER_PATTERN, { message: WHATSAPP_NUMBER_MESSAGE })
  whatsappNumber?: string;
}
