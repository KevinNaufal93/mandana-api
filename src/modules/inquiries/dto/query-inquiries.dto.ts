import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryInquiriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by property UUID' })
  @IsOptional()
  @IsUUID()
  propertyId?: string;
}
