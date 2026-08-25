import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { CreatePropertyDto } from './create-property.dto';
import { PropertyImageInputDto } from './property-image-input.dto';
import { ValidPropertyImagesBatch } from './property-images-batch.validator';

export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {
  @ApiPropertyOptional({
    type: [PropertyImageInputDto],
    description:
      'Complete desired image set, applied atomically alongside any field changes on this same request. ' +
      'Omit this field entirely to leave images untouched; pass [] to delete every existing image. ' +
      'An existing image whose id is absent from the array is deleted.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => PropertyImageInputDto)
  @ValidPropertyImagesBatch()
  images?: PropertyImageInputDto[];
}
