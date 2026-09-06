import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { BookingListQueryDto } from '../../../common/dto/booking-list-query.dto';
import { EventBookingStatus } from '../enums/event-booking-status.enum';
import { EventBookingSort } from '../enums/event-booking-sort.enum';

export class QueryEventBookingsDto extends BookingListQueryDto {
  @ApiPropertyOptional({ enum: EventBookingStatus })
  @IsOptional()
  @IsEnum(EventBookingStatus)
  status?: EventBookingStatus;

  @ApiPropertyOptional({
    example: '2026-03-01',
    description:
      "Bookings whose event window overlaps this range — endDate >= startFrom. Despite the name, this is an overlap test against the whole window, not just the start date (a multi-day booking that started earlier still matches if it hasn't ended yet). BREAKING CHANGE: this used to be named `from`; `from`/`to` now filter by createdAt (capture date) instead — see BookingListQueryDto.",
  })
  @IsOptional()
  @IsDateString({ strict: true })
  startFrom?: string;

  @ApiPropertyOptional({
    example: '2026-03-31',
    description:
      'Bookings whose event window overlaps this range — startDate <= startTo (see startFrom for the overlap semantics). BREAKING CHANGE: this used to be named `to`.',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  startTo?: string;

  @ApiPropertyOptional({
    enum: EventBookingSort,
    enumName: 'EventBookingSort',
    default: EventBookingSort.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(EventBookingSort)
  sortBy: EventBookingSort = EventBookingSort.CREATED_AT;
}
