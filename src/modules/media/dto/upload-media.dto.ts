import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadMediaDto {
  @ApiProperty({
    enum: ['hero', 'cover'],
    description: 'Determines which responsive widths are generated',
  })
  @IsIn(['hero', 'cover'])
  purpose!: 'hero' | 'cover';

  @ApiPropertyOptional({
    description: 'Alt text for the image (accessibility)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  alt?: string;
}
