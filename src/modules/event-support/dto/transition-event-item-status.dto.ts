import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { EventItemStatus } from '../enums/event-item-status.enum';

export class TransitionEventItemStatusDto {
  @ApiProperty({ enum: EventItemStatus })
  @IsEnum(EventItemStatus)
  status!: EventItemStatus;
}
