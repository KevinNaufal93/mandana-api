import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';
import { SortOrder } from '../enums/sort-order.enum';

/**
 * Shared base for every admin "pemesanan" list query (Moving, Storage, Event
 * Support). Carries only what is genuinely identical across all three —
 * `status` and `sortBy` stay module-specific (each is its own Postgres enum
 * type), declared on the subclass instead of hoisted here, so an invalid
 * status can never reach a module whose DB enum doesn't have it.
 */
export class BookingListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Case-insensitive substring match over reference, customer name, phone, and email',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: '2026-09-01',
    description:
      'Bookings captured on or after this Jakarta calendar day (inclusive, based on createdAt)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-03',
    description:
      'Bookings captured on or before this Jakarta calendar day — the whole day counts (inclusive, based on createdAt)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @ApiPropertyOptional({
    enum: SortOrder,
    enumName: 'SortOrder',
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.DESC;
}
