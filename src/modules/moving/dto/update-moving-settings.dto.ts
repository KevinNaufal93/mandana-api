import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateMovingSettingsDto {
  @ApiPropertyOptional({
    example: 10000,
    minimum: 1,
    maximum: 1_000_000,
    description: 'Rounding step applied to the quote total, in Rupiah.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  roundToIdr?: number;

  @ApiPropertyOptional({
    example: 10,
    minimum: 0,
    maximum: 50,
    description:
      'The ± percentage band shown to the customer around the total. 0 = exact price.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  bandPct?: number;

  @ApiPropertyOptional({
    example: 5,
    minimum: 0,
    maximum: 100,
    description:
      'Fallback included-km used when a truck class does not set its own includedKm.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  defaultIncludedKm?: number;
}
