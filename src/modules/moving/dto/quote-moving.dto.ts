import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Max, Min } from 'class-validator';

export class QuoteMovingDto {
  @ApiProperty({ example: 'pickup-bak', description: 'TruckClass.slug' })
  @IsString()
  truckSlug!: string;

  @ApiProperty({
    example: 151200,
    minimum: 1,
    maximum: 5_000_000,
    description:
      'Road distance in meters (from the client Routes call). 5,000,000 m = 5,000 km, wider than Indonesia.',
  })
  @IsInt()
  @Min(1)
  @Max(5_000_000)
  distanceMeters!: number;
}
