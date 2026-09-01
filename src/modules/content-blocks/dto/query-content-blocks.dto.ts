import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ContentBlockType } from '../enums/content-block-type.enum';

export class QueryContentBlocksDto {
  @ApiPropertyOptional({
    enum: ContentBlockType,
    description: 'Omit to list every type together.',
  })
  @IsOptional()
  @IsEnum(ContentBlockType)
  type?: ContentBlockType;
}
