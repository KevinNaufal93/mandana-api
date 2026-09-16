import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageImageSlot } from '../enums/page-image-slot.enum';

/**
 * Response-shape DTOs, declared purely so Swagger/OpenAPI can describe the
 * `{ data }` envelope the global `TransformInterceptor` wraps handler
 * returns in — same convention as seo/dto/seo-response.dto.ts. A local
 * image DTO rather than importing seo's `SeoImageDto` — every module with
 * image output (seo, content-blocks) declares its own, kept in sync by
 * hand against `MediaService.buildImageDto()`'s real shape.
 */

export class PageImageImageDto {
  @ApiProperty() url!: string;
  @ApiProperty() srcset!: string;
  @ApiProperty() srcsetAvif!: string;
  @ApiProperty({ nullable: true, type: String }) placeholder!: string | null;
  @ApiProperty({ nullable: true, type: String }) alt!: string | null;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

export class PageImageDto {
  @ApiProperty({ enum: PageImageSlot }) slotKey!: PageImageSlot;
  @ApiPropertyOptional({ nullable: true, type: PageImageImageDto })
  image!: PageImageImageDto | null;
}

export class PageImageListResponseDto {
  @ApiProperty({ type: PageImageDto, isArray: true })
  data!: PageImageDto[];
}

export class PageImageResponseDto {
  @ApiProperty({ type: PageImageDto })
  data!: PageImageDto;
}
