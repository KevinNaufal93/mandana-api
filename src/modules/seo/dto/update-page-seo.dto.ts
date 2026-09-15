import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdatePageSeoDto {
  @ApiPropertyOptional({
    description:
      "null/omitted falls back to the web app's own hardcoded default.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @ApiPropertyOptional({
    description:
      "null/omitted falls back to the web app's own hardcoded default.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  metaDescription?: string;

  @ApiPropertyOptional({
    description:
      'Only meaningful on the `home` page — the hidden <h1> rendered behind the image-only hero.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  heading?: string;

  @ApiPropertyOptional({
    description:
      'Hide this page from search engines. Rejected (400) for `home`.',
  })
  @IsOptional()
  @IsBoolean()
  noIndex?: boolean;

  @ApiPropertyOptional({
    description: "Media asset UUID — this page's own share image.",
  })
  @IsOptional()
  @IsUUID()
  ogMediaAssetId?: string;
}
