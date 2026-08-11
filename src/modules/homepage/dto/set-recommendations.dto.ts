import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsNumber,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class RecommendationItemDto {
  @IsUUID()
  propertyId!: string;

  @IsNumber()
  @Min(0)
  sortOrder!: number;
}

export class SetRecommendationsDto {
  @ApiProperty({
    type: [RecommendationItemDto],
    description: 'Full list of recommendations to set (replaces existing)',
  })
  @ValidateNested({ each: true })
  @Type(() => RecommendationItemDto)
  @ArrayMaxSize(12)
  items!: RecommendationItemDto[];
}
