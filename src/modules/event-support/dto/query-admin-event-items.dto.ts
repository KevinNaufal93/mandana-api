import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { EventItemKind } from '../enums/event-item-kind.enum';
import { EventItemStatus } from '../enums/event-item-status.enum';

export class QueryAdminEventItemsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by EventCategory UUID' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: EventItemKind })
  @IsOptional()
  @IsEnum(EventItemKind)
  kind?: EventItemKind;

  @ApiPropertyOptional({ enum: EventItemStatus })
  @IsOptional()
  @IsEnum(EventItemStatus)
  status?: EventItemStatus;

  @ApiPropertyOptional({ description: 'Search by item name' })
  @IsOptional()
  @IsString()
  search?: string;
}
