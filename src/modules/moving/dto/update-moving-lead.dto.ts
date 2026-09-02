import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MovingLeadStatus } from '../enums/moving-lead-status.enum';

/** Body for `PATCH /admin/moving/leads/:id` — every field optional so an
 * empty `{}` is valid, same convention as TransitionEventBookingDto /
 * TransitionStorageBookingDto's adminNote-only bodies. No confirm/reject/
 * cancel transition endpoints here — a lead reserves nothing, so a plain
 * status field (rather than a state machine) is proportionate. */
export class UpdateMovingLeadDto {
  @ApiPropertyOptional({ enum: MovingLeadStatus })
  @IsOptional()
  @IsEnum(MovingLeadStatus)
  status?: MovingLeadStatus;

  @ApiPropertyOptional({
    example: 'Follow-up dijadwalkan 3 Sep',
    description: 'Internal note, not shown to the customer',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}
