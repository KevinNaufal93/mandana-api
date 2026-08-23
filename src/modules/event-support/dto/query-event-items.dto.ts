import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { EventItemKind } from '../enums/event-item-kind.enum';

/** Public catalog listing — published items only (enforced in the service,
 * not here). `startDate`+`days` are optional; when both are given, the
 * response includes each item's live `availableQuantity`. */
export class QueryEventItemsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'EventCategory.slug' })
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @ApiPropertyOptional({ enum: EventItemKind })
  @IsOptional()
  @IsEnum(EventItemKind)
  kind?: EventItemKind;

  @ApiPropertyOptional({
    example: '2026-03-01',
    description: 'ISO 8601 date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ example: 2, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number;
}
