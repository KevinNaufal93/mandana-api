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

export class UpdateStorageSettingsDto {
  @ApiPropertyOptional({
    example: 20,
    minimum: 0,
    maximum: 100,
    description:
      'Insurance premium as a whole percentage of the rent subtotal — 20 means 20%, not basis points. total = subtotal + round(subtotal * insurancePct / 100). 0 disables the insurance line entirely.',
  })
  @IsOptional()
  @IsInt()
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
