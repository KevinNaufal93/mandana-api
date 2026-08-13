import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { StorageBookingStatus } from '../enums/storage-booking-status.enum';

export class QueryStorageBookingsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: StorageBookingStatus })
  @IsOptional()
  @IsEnum(StorageBookingStatus)
  status?: StorageBookingStatus;

  @ApiPropertyOptional({ description: 'StorageFacility.slug' })
  @IsOptional()
  @IsString()
  facilitySlug?: string;

  @ApiPropertyOptional({ description: 'StorageUnitType.slug' })
  @IsOptional()
  @IsString()
  unitTypeSlug?: string;
}
