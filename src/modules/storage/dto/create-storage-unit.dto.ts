import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { StorageUnitStatus } from '../enums/storage-unit-status.enum';

export class CreateStorageUnitDto {
  @ApiProperty({ description: 'StorageFacility.id' })
  @IsUUID()
  facilityId!: string;

  @ApiProperty({ description: 'StorageUnitType.id' })
  @IsUUID()
  unitTypeId!: string;

  @ApiProperty({
    example: 'M-13',
    description:
      'Stable, human-facing identifier — unique per facility. Never renumber.',
  })
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'code must be uppercase alphanumeric with hyphens',
  })
  code!: string;

  @ApiPropertyOptional({
    description: '1-based grid column. Omit until a real floor survey exists.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  gridColumn?: number;

  @ApiPropertyOptional({
    description: '1-based grid row. Omit until a real floor survey exists.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  gridRow?: number;

  @ApiPropertyOptional({
    description:
      'Omit to let the client derive from unitType.dimensions / facility.layoutCellCm.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  columnSpan?: number;

  @ApiPropertyOptional({
    description:
      'Omit to let the client derive from unitType.dimensions / facility.layoutCellCm.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  rowSpan?: number;

  @ApiPropertyOptional({
    enum: StorageUnitStatus,
    default: StorageUnitStatus.AVAILABLE,
  })
  @IsOptional()
  @IsEnum(StorageUnitStatus)
  status?: StorageUnitStatus;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
