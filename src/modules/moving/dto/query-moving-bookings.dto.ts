import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { BookingListQueryDto } from '../../../common/dto/booking-list-query.dto';
import { MovingBookingStatus } from '../enums/moving-booking-status.enum';
import { MovingBookingSort } from '../enums/moving-booking-sort.enum';

export class QueryMovingBookingsDto extends BookingListQueryDto {
  @ApiPropertyOptional({ enum: MovingBookingStatus })
  @IsOptional()
  @IsEnum(MovingBookingStatus)
  status?: MovingBookingStatus;

  @ApiPropertyOptional({
    enum: MovingBookingSort,
    enumName: 'MovingBookingSort',
    default: MovingBookingSort.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(MovingBookingSort)
  sortBy: MovingBookingSort = MovingBookingSort.CREATED_AT;
}
