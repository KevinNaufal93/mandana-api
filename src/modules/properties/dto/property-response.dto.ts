import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListingType } from '../enums/listing-type.enum';
import { ConstructionStatus } from '../enums/construction-status.enum';
import { PropertyStatus } from '../enums/property-status.enum';

/**
 * Response-shape DTOs, declared purely so Swagger/OpenAPI can describe the
 * `{ data }` envelope the global `TransformInterceptor` wraps handler
 * returns in — same convention as
 * event-support/dto/event-support-response.dto.ts and
 * storage/dto/storage-response.dto.ts. `PropertiesController.findOne`
 * keeps returning the bare object `PropertiesService.findBySlug` produces
 * (a `PublicPropertyDetail`, see property.mapper.ts); this file exists
 * only to drive `@ApiOkResponse`.
 *
 * This only covers the PUBLIC detail response (`GET /properties/:slug`,
 * always `locationPrecision: 'approximate'`, never an `address` key) — the
 * admin detail endpoint (`exact: true`) is untyped here, same as before
 * this change.
 */

export class PropertyMediaImageDto {
  @ApiProperty() url!: string;
  @ApiProperty() srcset!: string;
  @ApiProperty({
    description:
      'Empty when this asset has no AVIF variants — only hero-purpose uploads generate AVIF.',
  })
  srcsetAvif!: string;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      '~20px WebP data: URI for an instant blurred paint; null until backfilled for pre-existing assets.',
  })
  placeholder!: string | null;
  @ApiProperty({ nullable: true, type: String }) alt!: string | null;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

export class PropertyImageDto extends PropertyMediaImageDto {
  @ApiProperty() id!: string;
  @ApiProperty() isCover!: boolean;
  @ApiProperty() sortOrder!: number;
}

export class PropertyTypeRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

export class PropertyAmenityDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) icon!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) category!:
    string | null;
}

export class PropertyAgentDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) title!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) whatsapp!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: PropertyMediaImageDto })
  photo!: PropertyMediaImageDto | null;
}

/** A single admin-managed card in the `promoCards` array — always
 *  present, always `[]` when nothing applies (never `null`/absent). */
export class PropertyPromoCardDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) title!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: "The card's body copy (renamed from the admin's `subtitle`).",
  })
  body!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) ctaText!:
    string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: "The card's CTA target (renamed from the admin's `link`).",
  })
  ctaLink!: string | null;
  @ApiProperty({
    description:
      'When true, the artwork already carries the copy — render the image alone, no title/body/button overlay.',
  })
  imageOnly!: boolean;
  @ApiProperty() sortOrder!: number;
  @ApiPropertyOptional({ nullable: true, type: PropertyMediaImageDto })
  image!: PropertyMediaImageDto | null;
}

export class PropertyDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ListingType }) listingType!: ListingType;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'Handover/completion date (YYYY-MM-DD). Only meaningful when listingType is "new".',
  })
  handoverDate!: string | null;
  @ApiPropertyOptional({
    enum: ConstructionStatus,
    nullable: true,
    description: 'Only meaningful when listingType is "new".',
  })
  constructionStatus!: ConstructionStatus | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) price!: number | null;
  @ApiProperty() currency!: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) bedrooms!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) bathrooms!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) areaSqm!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) area!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) city!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) province!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: PropertyTypeRefDto })
  propertyType!: PropertyTypeRefDto | null;
  @ApiPropertyOptional({ nullable: true, type: PropertyMediaImageDto })
  cover!: PropertyMediaImageDto | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Sanitized HTML rich text.',
  })
  description!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'Plain-text derivative of `description` (HTML stripped) — SEO meta, share previews.',
  })
  descriptionText!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description:
      'Fuzzed within `approximateRadiusM` metres of the real location.',
  })
  latitude!: number | null;
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description:
      'Fuzzed within `approximateRadiusM` metres of the real location.',
  })
  longitude!: number | null;
  @ApiProperty({ enum: ['approximate'] })
  locationPrecision!: 'approximate';
  @ApiProperty({
    description: 'Radius, in metres, the coordinates above were fuzzed within.',
  })
  approximateRadiusM!: number;

  @ApiProperty({ enum: PropertyStatus }) status!: PropertyStatus;
  @ApiProperty() isFeatured!: boolean;
  @ApiProperty({ type: [PropertyImageDto] }) images!: PropertyImageDto[];
  @ApiProperty({ type: [PropertyAmenityDto] }) amenities!: PropertyAmenityDto[];
  @ApiPropertyOptional({ nullable: true, type: PropertyAgentDto })
  agent!: PropertyAgentDto | null;

  @ApiProperty({
    type: [PropertyPromoCardDto],
    description:
      'Admin-managed promo cards for the sidebar, directly below the agent card — always an array, ' +
      '[] when nothing is active/matching for this listingType. The server resolves isActive and the ' +
      'listing-type scope and returns them pre-ordered by sortOrder; the client renders whatever it is ' +
      'given, in order, and nothing when the array is empty.',
  })
  promoCards!: PropertyPromoCardDto[];

  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PropertyDetailResponseDto {
  @ApiProperty({ type: PropertyDetailDto })
  data!: PropertyDetailDto;
}
