import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** A single lat/lng point with an optional human-readable address — the
 * shared shape for `pickup` and each entry in `destinations` on
 * CreateMovingLeadDto. */
export class MovingPointDto {
  @ApiPropertyOptional({ example: 'Jl. Sudirman No. 1, Jakarta Selatan' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiProperty({ example: -6.2088 })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 106.8456 })
  @IsLongitude()
  lng!: number;
}
