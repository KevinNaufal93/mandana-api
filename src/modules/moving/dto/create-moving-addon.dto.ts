import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { RichText } from '../../../common/rich-text';
import { MovingAddonKind } from '../enums/moving-addon-kind.enum';
import { MovingAddonPricingModel } from '../enums/moving-addon-pricing-model.enum';

export class CreateMovingAddonDto {
  @ApiProperty({ example: 'Helper' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({
    example: 'helper',
    description:
      'URL-safe slug, unique. Auto-generated from name when omitted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  slug?: string;

  @RichText()
  description?: string;

  @ApiProperty({ enum: MovingAddonKind, example: MovingAddonKind.HELPER })
  @IsEnum(MovingAddonKind)
  kind!: MovingAddonKind;

  @ApiProperty({
    enum: MovingAddonPricingModel,
    example: MovingAddonPricingModel.PER_UNIT,
  })
  @IsEnum(MovingAddonPricingModel)
  pricingModel!: MovingAddonPricingModel;

  @ApiPropertyOptional({
    example: 150000,
    minimum: 0,
    default: 0,
    description: 'Rupiah, integer. Used by `flat` and `per_unit` models.',
  })
  @ValidateIf(
    (o: CreateMovingAddonDto) =>
      o.pricingModel !== MovingAddonPricingModel.PERCENT,
  )
  @IsInt()
  @Min(1)
  unitPrice?: number;

  @ApiPropertyOptional({
    example: 20,
    minimum: 0,
    maximum: 10000,
    description: 'Basis points (20 = 0.2%). Required by the `percent` model.',
  })
  @ValidateIf(
    (o: CreateMovingAddonDto) =>
      o.pricingModel === MovingAddonPricingModel.PERCENT,
  )
  @IsInt()
  @Min(1)
  @Max(10_000)
  percentBps?: number;

  @ApiPropertyOptional({
    example: 50000,
    minimum: 0,
    description: 'Rupiah floor',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  minCharge?: number;

  @ApiPropertyOptional({ description: 'Rupiah cap' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxCharge?: number;

  @ApiPropertyOptional({
    example: 'orang',
    description: 'Display-only unit label',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  unitLabel?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minQty?: number;

  @ApiPropertyOptional({ default: 10, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxQty?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      "Doubles this add-on's amount when the quote has roundTrip: true.",
  })
  @IsOptional()
  @IsBoolean()
  doublesOnRoundTrip?: boolean;

  @ApiPropertyOptional({
    description:
      'Upload an image first via POST /admin/media/upload, then pass its id',
  })
  @IsOptional()
  @IsUUID()
  mediaAssetId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;
}
