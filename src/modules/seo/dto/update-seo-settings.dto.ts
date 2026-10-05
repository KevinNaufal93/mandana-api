import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  WHATSAPP_NUMBER_MAX_LENGTH,
  WHATSAPP_NUMBER_MESSAGE,
  WHATSAPP_NUMBER_PATTERN,
  trimWhatsappNumber,
} from '../../../common/validation/whatsapp-number';

export class UpdateSeoSettingsDto {
  @ApiPropertyOptional({ example: 'Mandana Property' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  organizationName?: string;

  @ApiPropertyOptional({ example: '+6281234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  @ApiPropertyOptional({
    example: '+6281234567890',
    description:
      'WhatsApp number for the General line (Beranda, Tentang Kami, Artikel, and the fallback for any business left empty). Exactly as typed (the website normalizes it). An empty string clears it, which makes the website fall back to the General number.',
  })
  @Transform(trimWhatsappNumber)
  @IsOptional()
  @IsString()
  @MaxLength(WHATSAPP_NUMBER_MAX_LENGTH)
  @Matches(WHATSAPP_NUMBER_PATTERN, { message: WHATSAPP_NUMBER_MESSAGE })
  whatsappNumber?: string;

  @ApiPropertyOptional({ example: 'hello@mandana.id' })
  // An empty string means "clear it" (SeoService maps it to null), and the
  // admin form sends one whenever the box is blank, so it must skip IsEmail.
  @ValidateIf((o: UpdateSeoSettingsDto) => o.contactEmail !== '')
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({ example: 'Jl. Boulevard Raya No. 1, BSD City' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  streetAddress?: string;

  @ApiPropertyOptional({ example: 'Tangerang Selatan' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  addressLocality?: string;

  @ApiPropertyOptional({ example: 'Banten' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  addressRegion?: string;

  @ApiPropertyOptional({ example: '15345' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({
    type: Object,
    example: { instagram: 'https://instagram.com/mandana.property' },
    description:
      'Known keys the web client renders as footer icons: instagram, tiktok, facebook, youtube, x, linkedin. ' +
      'An absent key renders no icon — never a placeholder link. Unknown keys are stored but ignored.',
  })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Google Search Console verification code',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  googleSiteVerification?: string;

  @ApiPropertyOptional({
    description: 'Bing Webmaster Tools verification code',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bingSiteVerification?: string;

  @ApiPropertyOptional({
    description:
      'Media asset UUID — the default Open Graph share image for pages that set none of their own.',
  })
  @IsOptional()
  @IsUUID()
  defaultOgMediaAssetId?: string;
}
