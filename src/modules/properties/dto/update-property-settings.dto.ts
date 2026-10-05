import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdatePropertySettingsDto {
  @ApiPropertyOptional({
    example: 1.75,
    minimum: 0,
    maximum: 30,
    description:
      'KPR fixed interest rate, in percent per year. 1.75 means 1.75%. At most 2 decimal places.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(30)
  kprAnnualRatePct?: number;

  @ApiPropertyOptional({
    example: 25,
    minimum: 1,
    maximum: 30,
    description: 'KPR tenor in whole years.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  kprTenorYears?: number;
}
