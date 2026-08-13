import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body for the confirm/reject/cancel/complete transition endpoints — every
 * field is optional so an empty `{}` (or omitted) body is valid. */
export class TransitionStorageBookingDto {
  @ApiPropertyOptional({
    example: 'Slot dikonfirmasi, kunci diserahkan 1 Sep',
    description: 'Internal note, not shown to the customer',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}
