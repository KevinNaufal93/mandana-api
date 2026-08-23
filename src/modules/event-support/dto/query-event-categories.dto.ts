import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/** Admin-only filter for GET /admin/event-support/categories — public
 * categories are always active-only regardless of this flag. */
export class QueryEventCategoriesDto {
  @ApiPropertyOptional({
    description:
      'Filter by active state. Public endpoints always return active-only regardless of this flag.',
  })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;
}
