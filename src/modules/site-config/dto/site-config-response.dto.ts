import { ApiProperty } from '@nestjs/swagger';

export class SiteConfigWhatsappDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'General number (Beranda, Tentang Kami, Artikel).',
  })
  general!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Mandana Move' })
  moving!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Mandana Space' })
  storage!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Mandana Living' })
  event!: string | null;
}

export class SiteConfigKprDto {
  @ApiProperty({ example: 1.75, description: 'Fixed rate, percent per year' })
  annualRatePct!: number;
  @ApiProperty({ example: 25, description: 'Tenor in whole years' })
  tenorYears!: number;
}

export class SiteConfigDto {
  @ApiProperty({ type: SiteConfigWhatsappDto })
  whatsapp!: SiteConfigWhatsappDto;
  @ApiProperty({ type: SiteConfigKprDto })
  kpr!: SiteConfigKprDto;
}

export class SiteConfigResponseDto {
  @ApiProperty({ type: SiteConfigDto })
  data!: SiteConfigDto;
}
