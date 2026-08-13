import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateStorageInventoryDto {
  @ApiProperty({ description: 'StorageFacility.id' })
  @IsUUID()
  facilityId!: string;

  @ApiProperty({ description: 'StorageUnitType.id' })
  @IsUUID()
  unitTypeId!: string;

  @ApiProperty({ example: 12, minimum: 1 })
  @IsInt()
  @Min(1)
  totalUnits!: number;

  @ApiPropertyOptional({
    example: 0,
    minimum: 0,
    default: 0,
    description:
      'For manually correcting stock (e.g. onboarding pre-existing tenants not tracked as bookings). Must not exceed totalUnits.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  occupiedUnits?: number;

  @ApiPropertyOptional({
    minimum: 0,
    description:
      "Rupiah, integer. Overrides the unit type's base monthlyRate for this facility.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyRateOverride?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
