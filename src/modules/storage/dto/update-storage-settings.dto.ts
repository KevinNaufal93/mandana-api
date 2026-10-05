import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNumber,
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

export class UpdateStorageSettingsDto {
  @ApiPropertyOptional({
    example: 0.5,
    minimum: 0,
    maximum: 100,
    description:
      'Insurance premium as a percentage of the customer-DECLARED GOODS VALUE, not the rent — 0.5 means 0.5%, at most 2 decimal places. Stored internally as basis points (rounded: 0.5 -> 50 bps). total = subtotal + round(declaredValue * insurancePct / 100). 0 disables the insurance line entirely.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  insurancePct?: number;

  @ApiPropertyOptional({
    example: '+6281234567890',
    description:
      'WhatsApp number for Mandana Space. Exactly as typed (the website normalizes it). An empty string clears it, which makes the website fall back to the General number.',
  })
  @Transform(trimWhatsappNumber)
  @IsOptional()
  @IsString()
  @MaxLength(WHATSAPP_NUMBER_MAX_LENGTH)
  @Matches(WHATSAPP_NUMBER_PATTERN, { message: WHATSAPP_NUMBER_MESSAGE })
  whatsappNumber?: string;
}
