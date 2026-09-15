import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

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

  @ApiPropertyOptional({ example: 'hello@mandana.id' })
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
