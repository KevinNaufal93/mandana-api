import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response-shape DTOs, declared purely so Swagger/OpenAPI can describe the
 * `{ data }` envelope the global `TransformInterceptor` wraps handler
 * returns in — same convention as
 * properties/dto/property-response.dto.ts. `ArticlesController.findOne`
 * keeps returning the bare object `ArticlesService.findBySlug` produces (an
 * `ArticleDetail`, see article.mapper.ts); this file exists only to drive
 * `@ApiOkResponse`. Only the public detail response is typed here, matching
 * property-response.dto.ts's own scope — list/admin responses are untyped.
 */

export class ArticleMediaImageDto {
  @ApiProperty() url!: string;
  @ApiProperty() srcset!: string;
  @ApiProperty({
    description:
      'Empty when this asset has no AVIF variants — only hero-purpose uploads generate AVIF.',
  })
  srcsetAvif!: string;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      '~20px WebP data: URI for an instant blurred paint; null until backfilled for pre-existing assets.',
  })
  placeholder!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) alt!: string | null;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

export class ArticleCategoryRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}

export class ArticleAuthorDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'e.g. "Content Editor". Null renders no role line.',
  })
  role!: string | null;
  @ApiPropertyOptional({ nullable: true, type: ArticleMediaImageDto })
  avatar!: ArticleMediaImageDto | null;
}

export class ArticleDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() excerpt!: string;
  @ApiPropertyOptional({ nullable: true, type: ArticleMediaImageDto })
  coverImage!: ArticleMediaImageDto | null;
  @ApiProperty({ type: ArticleCategoryRefDto })
  category!: ArticleCategoryRefDto;
  @ApiProperty({ type: ArticleAuthorDto }) author!: ArticleAuthorDto;
  @ApiProperty({ description: 'ISO 8601.' }) publishedAt!: string;
  @ApiProperty() readingMinutes!: number;
  @ApiProperty({ description: 'Finished, render-ready HTML.' })
  bodyHtml!: string;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Null until the article is edited post-publish.',
  })
  updatedAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) metaTitle!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) metaDescription!:
    string | null;
}

export class ArticleDetailResponseDto {
  @ApiProperty({ type: ArticleDetailDto })
  data!: ArticleDetailDto;
}
