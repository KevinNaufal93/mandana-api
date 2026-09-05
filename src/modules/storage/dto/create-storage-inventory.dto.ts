import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateStorageInventoryDto {
  @ApiProperty({ description: 'StorageFacility.id' })
  @IsUUID()
  facilityId!: string;

  @ApiProperty({ description: 'StorageUnitType.id' })
  @IsUUID()
  unitTypeId!: string;

  @ApiPropertyOptional({
    minimum: 0,
    description:
      "Rupiah, integer. Overrides the unit type's base monthlyRate for this facility.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyRateOverride?: number;

  @ApiPropertyOptional({
    minimum: 0,
    description:
      "Rupiah, integer. Overrides the unit type's base weeklyRate for this facility — independent of monthlyRateOverride.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  weeklyRateOverride?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
