import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { StorageUnitStatus } from '../enums/storage-unit-status.enum';

export class QueryStorageUnitsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by facility UUID' })
  @IsOptional()
  @IsUUID()
  facilityId?: string;

  @ApiPropertyOptional({ description: 'Filter by unit type UUID' })
  @IsOptional()
  @IsUUID()
  unitTypeId?: string;

  @ApiPropertyOptional({ enum: StorageUnitStatus })
  @IsOptional()
  @IsEnum(StorageUnitStatus)
  status?: StorageUnitStatus;
}
