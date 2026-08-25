import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RichText } from '../../../common/rich-text';
import { ListingType } from '../enums/listing-type.enum';
import { ConstructionStatus } from '../enums/construction-status.enum';
import { PropertyStatus } from '../enums/property-status.enum';

export class CreatePropertyDto {
  @ApiPropertyOptional({
    example: 'villa-canggu-bali',
    description:
      'URL-safe slug, unique. Auto-generated from title when omitted.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  slug?: string;

  @ApiProperty({ example: 'Villa Canggu Bali' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title!: string;

  @RichText()
  description?: string;

  @ApiPropertyOptional({ enum: ListingType, default: ListingType.SALE })
  @IsOptional()
  @IsEnum(ListingType)
  listingType?: ListingType;

  @ApiPropertyOptional({
    example: '2027-06-30',
    description:
      'Handover/completion date (YYYY-MM-DD). Only valid when listingType is "new".',
  })
  @IsOptional()
  @IsDateString()
  handoverDate?: string;

  @ApiPropertyOptional({
    enum: ConstructionStatus,
    description: 'Only valid when listingType is "new".',
  })
  @IsOptional()
  @IsEnum(ConstructionStatus)
  constructionStatus?: ConstructionStatus;

  @ApiPropertyOptional({ enum: PropertyStatus, default: PropertyStatus.DRAFT })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @ApiProperty({ example: 5000000000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 'IDR', default: 'IDR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bedrooms?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bathrooms?: number;

  @ApiPropertyOptional({ example: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  areaSqm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  area?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @ApiPropertyOptional({ example: -8.409518 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 115.188919 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ description: 'PropertyType UUID' })
  @IsOptional()
  @IsUUID()
  propertyTypeId?: string;

  @ApiPropertyOptional({
    description:
      'Agent (User) UUID shown on the detail page. Defaults to the creating admin.',
  })
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Amenity UUIDs' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  amenityIds?: string[];
}
