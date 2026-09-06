import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body for the confirm/reject/cancel/complete transition endpoints — every
 * field is optional so an empty `{}` (or omitted) body is valid. Mirrors
 * TransitionStorageBookingDto verbatim. */
export class TransitionMovingBookingDto {
  @ApiPropertyOptional({
    example: 'Dikonfirmasi via telepon, jadwal 5 Sep jam 09:00',
    description: 'Internal note, not shown to the customer',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}
