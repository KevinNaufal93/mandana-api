import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class QueryStorageInventoryDto {
  @ApiPropertyOptional({ description: 'Filter by facility UUID' })
  @IsOptional()
  @IsUUID()
  facilityId?: string;

  @ApiPropertyOptional({ description: 'Filter by unit type UUID' })
  @IsOptional()
  @IsUUID()
  unitTypeId?: string;
}
