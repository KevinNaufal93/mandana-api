import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { NotificationSourceModule } from '../enums/notification-source-module.enum';
import { NotificationFilter } from '../enums/notification-filter.enum';

export class QueryAdminNotificationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: NotificationSourceModule })
  @IsOptional()
  @IsEnum(NotificationSourceModule)
  sourceModule?: NotificationSourceModule;

  @ApiPropertyOptional({
    enum: NotificationFilter,
    enumName: 'NotificationFilter',
    default: NotificationFilter.ALL,
    description:
      '`unresolved` narrows to bookings still pending; `all` (default) is the full history feed',
  })
  @IsOptional()
  @IsEnum(NotificationFilter)
  filter: NotificationFilter = NotificationFilter.ALL;
}
