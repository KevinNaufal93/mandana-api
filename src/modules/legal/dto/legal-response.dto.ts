import { ApiProperty } from '@nestjs/swagger';

export class LegalPageDto {
  @ApiProperty() pageKey!: string;
  @ApiProperty() title!: string;
  @ApiProperty() bodyHtml!: string;
  @ApiProperty() bodyText!: string;
  @ApiProperty() updatedAt!: string;
}

export class LegalPageResponseDto {
  @ApiProperty({ type: LegalPageDto })
  data!: LegalPageDto;
}

export class LegalPageListResponseDto {
  @ApiProperty({ type: [LegalPageDto] })
  data!: LegalPageDto[];
}
