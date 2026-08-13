import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/** Shared by the admin unit-types and facilities lists. */
export class QueryStorageActiveDto {
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
