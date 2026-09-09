import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateStorageSettingsDto {
  @ApiPropertyOptional({
    example: 20,
    minimum: 0,
    maximum: 100,
    description:
      'Insurance premium as a whole percentage of the rent subtotal — 20 means 20%, not basis points. total = subtotal + round(subtotal * insurancePct / 100). 0 disables the insurance line entirely.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  insurancePct?: number;
}
