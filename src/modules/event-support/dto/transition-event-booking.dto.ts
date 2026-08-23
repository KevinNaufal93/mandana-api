import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body for the confirm/cancel/complete transition endpoints — every field
 * is optional so an empty `{}` (or omitted) body is valid. */
export class TransitionEventBookingDto {
  @ApiPropertyOptional({
    example: 'Dikonfirmasi, DP diterima 1 Mar',
    description: 'Internal note, not shown to the customer',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}
