import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Ops-facing convenience for adding capacity without doing it one row at a
 * time — the same generation logic the initial migration's seed step
 * already needs (codePrefix + sequential numbering), exposed as an endpoint.
 */
export class BulkCreateStorageUnitsDto {
  @ApiProperty({ description: 'StorageFacility.id' })
  @IsUUID()
  facilityId!: string;

  @ApiProperty({ description: 'StorageUnitType.id' })
  @IsUUID()
  unitTypeId!: string;

  @ApiProperty({ example: 8, minimum: 1, maximum: 500 })
  @IsInt()
  @Min(1)
  @Max(500)
  count!: number;

  @ApiProperty({
    example: 'M',
    description:
      'Codes are generated as "<prefix>-<NN>", continuing from the highest existing sequence number for this facility + prefix.',
  })
  @IsString()
  @MaxLength(10)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'codePrefix must be uppercase alphanumeric',
  })
  codePrefix!: string;
}
