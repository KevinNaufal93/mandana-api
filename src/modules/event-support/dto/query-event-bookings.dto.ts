import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { EventBookingStatus } from '../enums/event-booking-status.enum';

export class QueryEventBookingsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EventBookingStatus })
  @IsOptional()
  @IsEnum(EventBookingStatus)
  status?: EventBookingStatus;

  @ApiPropertyOptional({
    example: '2026-03-01',
    description: 'Bookings whose endDate >= from',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-03-31',
    description: 'Bookings whose startDate <= to',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @ApiPropertyOptional({
    description: 'Matches booking reference, customer name, or phone',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
