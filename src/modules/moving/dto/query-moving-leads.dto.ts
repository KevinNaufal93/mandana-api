import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MovingLeadStatus } from '../enums/moving-lead-status.enum';

export class QueryMovingLeadsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MovingLeadStatus })
  @IsOptional()
  @IsEnum(MovingLeadStatus)
  status?: MovingLeadStatus;
}
