import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RichText } from '../../../common/rich-text';
import { EventItemKind } from '../enums/event-item-kind.enum';

/**
 * Always creates a `draft` item — `status` is deliberately not a field
 * here. Moving an item to `published`/`archived` goes through the separate
 * PATCH /admin/event-support/items/:id/status endpoint; see
 * EventItemsService for why the split exists ("only draft is editable").
 */
export class CreateEventItemDto {
  @ApiProperty({ description: 'EventCategory UUID' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: 'Medium Venue Package' })
  @IsString()
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional({
    example: 'medium-venue-package',
    description:
      'URL-safe slug, unique. Auto-generated from name when omitted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({ enum: EventItemKind, default: EventItemKind.PACKAGE })
  @IsOptional()
  @IsEnum(EventItemKind)
  kind?: EventItemKind;

  @RichText()
  description?: string;

  @ApiProperty({ example: 3500000, minimum: 0, description: 'Rupiah, integer' })
  @IsInt()
  @Min(0)
  pricePerDay!: number;

  @ApiProperty({ example: 3, minimum: 0 })
  @IsInt()
  @Min(0)
  stockQuantity!: number;

  @ApiPropertyOptional({
    example: 900000,
    minimum: 0,
    description:
      'Rupiah, integer. The price for one 8-hour rental block — independent of pricePerDay, never derived from it. Required (and must be > 0, and must not exceed pricePerDay) when supportsEightHour is true.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  eightHourRate?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Opts this item into 8-hour block pricing for a rental window at or under 8 hours. Requires a positive eightHourRate no greater than pricePerDay.',
  })
  @IsOptional()
  @IsBoolean()
  supportsEightHour?: boolean;

  @ApiPropertyOptional({
    description:
      'Upload an image first via POST /admin/media/upload, then pass its id',
  })
  @IsOptional()
  @IsUUID()
  mediaAssetId?: string;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;
}
