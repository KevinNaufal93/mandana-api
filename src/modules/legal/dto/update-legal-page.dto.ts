import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { RichText } from '../../../common/rich-text';

export class UpdateLegalPageDto {
  @ApiPropertyOptional({ example: 'Kebijakan Privasi' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @RichText()
  bodyHtml?: string;
}
