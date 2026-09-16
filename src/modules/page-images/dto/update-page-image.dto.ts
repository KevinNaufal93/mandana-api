import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class UpdatePageImageDto {
  @ApiPropertyOptional({
    nullable: true,
    description:
      "Media asset UUID. Send null to clear this slot back to the web app's own hardcoded fallback image.",
  })
  @IsOptional()
  @IsUUID()
  mediaAssetId?: string | null;
}
