import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SeoPageKey } from '../enums/seo-page-key.enum';

/**
 * Response-shape DTOs, declared purely so Swagger/OpenAPI can describe the
 * `{ data }` envelope the global `TransformInterceptor` wraps handler
 * returns in — same convention as moving/dto/truck-class-response.dto.ts.
 */

export class SeoImageDto {
  @ApiProperty() url!: string;
  @ApiProperty() srcset!: string;
  @ApiProperty() srcsetAvif!: string;
  @ApiProperty({ nullable: true, type: String }) placeholder!: string | null;
  @ApiProperty({ nullable: true, type: String }) alt!: string | null;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

export class SeoSettingsDto {
  @ApiProperty() organizationName!: string;
  @ApiProperty({ nullable: true, type: String }) contactPhone!: string | null;
  @ApiProperty({ nullable: true, type: String }) contactEmail!: string | null;
  @ApiProperty({ nullable: true, type: String }) streetAddress!: string | null;
  @ApiProperty({ nullable: true, type: String }) addressLocality!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) addressRegion!: string | null;
  @ApiProperty({ nullable: true, type: String }) postalCode!: string | null;
  @ApiProperty({ type: Object }) socialLinks!: Record<string, string>;
  @ApiProperty({ nullable: true, type: String }) googleSiteVerification!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) bingSiteVerification!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: SeoImageDto })
  defaultOgImage!: SeoImageDto | null;
}

export class SeoSettingsResponseDto {
  @ApiProperty({ type: SeoSettingsDto })
  data!: SeoSettingsDto;
}

export class PageSeoDto {
  @ApiProperty({ enum: SeoPageKey }) pageKey!: SeoPageKey;
  @ApiProperty({ nullable: true, type: String }) metaTitle!: string | null;
  @ApiProperty({ nullable: true, type: String }) metaDescription!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) heading!: string | null;
  @ApiProperty() noIndex!: boolean;
  @ApiPropertyOptional({ nullable: true, type: SeoImageDto })
  ogImage!: SeoImageDto | null;
}

export class PageSeoListResponseDto {
  @ApiProperty({ type: PageSeoDto, isArray: true })
  data!: PageSeoDto[];
}

export class PageSeoResponseDto {
  @ApiProperty({ type: PageSeoDto })
  data!: PageSeoDto;
}

/** GET /seo — the one public read, `{ settings, pages }`. */
export class SeoPayloadDto {
  @ApiProperty({ type: SeoSettingsDto }) settings!: SeoSettingsDto;
  @ApiProperty({ type: PageSeoDto, isArray: true }) pages!: PageSeoDto[];
}

export class SeoPayloadResponseDto {
  @ApiProperty({ type: SeoPayloadDto })
  data!: SeoPayloadDto;
}
