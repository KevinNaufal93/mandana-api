import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MovingLeadStatus } from '../enums/moving-lead-status.enum';

export class QueryMovingLeadsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MovingLeadStatus })
  @IsOptional()
  @IsEnum(MovingLeadStatus)
  status?: MovingLeadStatus;

  @ApiPropertyOptional({
    example: '2026-09-01',
    description:
      'Leads captured on or after this Jakarta calendar day (inclusive). Unlike Event Support, whose from/to bound a booking event window, a Moving lead has no event window — this bounds capture time (createdAt).',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-03',
    description:
      'Leads captured on or before this Jakarta calendar day — the whole day counts, not midnight. Any time component is ignored.',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @ApiPropertyOptional({
    description: 'Matches lead reference, customer name, or phone',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
