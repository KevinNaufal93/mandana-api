import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MediaPurpose } from '../enums/media-purpose.enum';

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true';

export class QueryMediaDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MediaPurpose })
  @IsOptional()
  @IsEnum(MediaPurpose)
  purpose?: MediaPurpose;

  @ApiPropertyOptional({
    description:
      'Only assets not referenced by any owning entity — the "safe to delete" view for the admin picker.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unused?: boolean;

  @ApiPropertyOptional({
    description:
      'Include a usage count per asset (one extra batched query for the page, not N+1).',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  withUsage?: boolean;
}
