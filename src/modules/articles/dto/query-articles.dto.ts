import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryArticlesDto extends PaginationQueryDto {
  // Redeclares the full `limit` validator stack (not just the default) —
  // class-validator inherits the parent's decorators alongside these, so
  // just overriding the field initializer wouldn't change the applied
  // metadata, and `whitelist: true` would otherwise have nothing to keep.
  // Default 9 matches mandana-web's 3-up grid × 3 rows; ceiling stays 100,
  // same as PaginationQueryDto — a subclass can't raise it.
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 9;

  @ApiPropertyOptional({ description: 'Filter to one category by slug' })
  @IsOptional()
  @IsString()
  categorySlug?: string;
}
