import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RichText } from '../../../common/rich-text';
import { ArticleStatus } from '../enums/article-status.enum';

export class CreateArticleDto {
  @ApiPropertyOptional({
    example: 'panduan-membeli-rumah-pertama',
    description:
      'URL-safe slug, unique. Auto-generated from title when omitted.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  slug?: string;

  @ApiProperty({ example: 'Panduan Membeli Rumah Pertama' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title!: string;

  @ApiProperty({
    example: 'Semua yang perlu Anda tahu sebelum membeli rumah pertama.',
    description:
      'Plain text, admin-authored — NOT auto-truncated from bodyHtml. Used ' +
      'as the card summary and as the meta description fallback.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  excerpt!: string;

  @RichText({ required: true })
  bodyHtml!: string;

  @ApiPropertyOptional({ enum: ArticleStatus, default: ArticleStatus.DRAFT })
  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @ApiProperty({ description: 'ArticleCategory UUID' })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({
    description:
      'Author (User) UUID shown on the byline. Defaults to the creating admin.',
  })
  @IsOptional()
  @IsUUID()
  authorId?: string;

  @ApiPropertyOptional({ description: 'Cover media asset UUID' })
  @IsOptional()
  @IsUUID()
  coverMediaAssetId?: string;

  @ApiPropertyOptional({
    description: 'SEO title override. Client falls back to `title` when null.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @ApiPropertyOptional({
    description:
      'SEO description override. Client falls back to `excerpt` when null.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  metaDescription?: string;
}
