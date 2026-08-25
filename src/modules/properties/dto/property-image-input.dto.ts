import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * One entry in `UpdatePropertyDto.images` — the complete desired end state
 * of a single property image. Exactly one of `id`/`mediaAssetId` must be
 * present (enforced array-wide by `ValidPropertyImagesBatch`, not per-field
 * here, since a per-field `@ValidateIf` cross-check would be skipped
 * whenever its own gating property is absent).
 */
export class PropertyImageInputDto {
  @ApiPropertyOptional({
    description:
      'Existing PropertyImage id to update (or no-op, if nothing differs). Mutually exclusive with mediaAssetId.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({
    description:
      'MediaAsset id from POST /admin/media/upload to attach as a new image. Mutually exclusive with id.',
  })
  @IsOptional()
  @IsUUID()
  mediaAssetId?: string;

  @ApiPropertyOptional({ description: 'Alt text for accessibility' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  alt?: string;

  @ApiPropertyOptional({
    description: "Falls back to this entry's index in the array when omitted",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'At most one entry in the array may set this to true',
  })
  @IsOptional()
  @IsBoolean()
  isCover?: boolean;
}
