import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class AddCollectionPropertyDto {
  @ApiProperty()
  @IsUUID()
  propertyId!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}
