import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { BookingListQueryDto } from '../../../common/dto/booking-list-query.dto';
import { StorageBookingStatus } from '../enums/storage-booking-status.enum';
import { StorageBookingSort } from '../enums/storage-booking-sort.enum';

export class QueryStorageBookingsDto extends BookingListQueryDto {
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

  @ApiPropertyOptional({
    example: '2026-09-01',
    description:
      "Bookings whose rental window overlaps this range — endDate >= startFrom. Despite the name, this is an overlap test against the whole window, not just the start date (a booking that started earlier still matches if it hasn't ended yet).",
  })
  @IsOptional()
  @IsDateString({ strict: true })
  startFrom?: string;

  @ApiPropertyOptional({
    example: '2026-09-30',
    description:
      'Bookings whose rental window overlaps this range — startDate <= startTo (see startFrom for the overlap semantics).',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  startTo?: string;

  @ApiPropertyOptional({
    enum: StorageBookingSort,
    enumName: 'StorageBookingSort',
    default: StorageBookingSort.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(StorageBookingSort)
  sortBy: StorageBookingSort = StorageBookingSort.CREATED_AT;
}
