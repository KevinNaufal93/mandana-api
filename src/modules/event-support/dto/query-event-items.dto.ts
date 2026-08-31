import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { EventItemKind } from '../enums/event-item-kind.enum';
import {
  IsNaiveLocalDateTime,
  ValidRentalWindow,
} from './rental-window.validator';

/** Public catalog listing — published items only (enforced in the service,
 * not here). `dropoffAt`/`pickupAt` are optional but must be given
 * together; when both are given, the response includes each item's live
 * `activeRate` (and, on the detail endpoint, `availableQuantity`). */
export class QueryEventItemsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'EventCategory.slug' })
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @ApiPropertyOptional({ enum: EventItemKind })
  @IsOptional()
  @IsEnum(EventItemKind)
  kind?: EventItemKind;

  @ApiPropertyOptional({
    example: '2026-03-01T09:00',
    description:
      'Drop-off timestamp, naive local datetime (Asia/Jakarta). Must be paired with pickupAt.',
  })
  @IsOptional()
  @IsNaiveLocalDateTime()
  dropoffAt?: string;

  @ApiPropertyOptional({
    example: '2026-03-01T17:00',
    description:
      'Pickup timestamp, naive local datetime (Asia/Jakarta). Must be paired with dropoffAt.',
  })
  @IsOptional()
  @IsNaiveLocalDateTime()
  @ValidRentalWindow()
  pickupAt?: string;
}
