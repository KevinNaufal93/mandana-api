import { ApiProperty } from '@nestjs/swagger';

export class PropertySettingsDto {
  @ApiProperty({
    example: 1.75,
    description: 'KPR fixed interest rate, percent per year.',
  })
  kprAnnualRatePct!: number;

  @ApiProperty({ example: 25, description: 'KPR tenor in whole years.' })
  kprTenorYears!: number;
}

export class PropertySettingsResponseDto {
  @ApiProperty({ type: PropertySettingsDto })
  data!: PropertySettingsDto;
}
