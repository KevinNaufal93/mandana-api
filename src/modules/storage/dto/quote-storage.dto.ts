import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QuoteStorageDto {
  @ApiProperty({ example: 'bsd-city', description: 'StorageFacility.slug' })
  @IsString()
  facilitySlug!: string;

  @ApiProperty({ example: 'medium', description: 'StorageUnitType.slug' })
  @IsString()
  unitTypeSlug!: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  quantity?: number;

  @ApiProperty({ example: 6, minimum: 1, maximum: 60 })
  @IsInt()
  @Min(1)
  @Max(60)
  durationMonths!: number;
}
