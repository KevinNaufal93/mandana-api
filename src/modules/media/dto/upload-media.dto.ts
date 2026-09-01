import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MediaPurpose } from '../enums/media-purpose.enum';

export class UploadMediaDto {
  @ApiProperty({
    enum: MediaPurpose,
    description:
      'Determines the generated width ladder and formats. SVG files are only accepted when purpose=icon (they are rasterized, not stored as-is).',
  })
  @IsEnum(MediaPurpose)
  purpose!: MediaPurpose;

  @ApiPropertyOptional({
    description: 'Alt text for the image (accessibility)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  alt?: string;
}
