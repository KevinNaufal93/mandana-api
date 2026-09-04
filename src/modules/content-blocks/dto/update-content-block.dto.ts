import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { CreateContentBlockDto } from './create-content-block.dto';
import { ListingType } from '../../properties/enums/listing-type.enum';

// mediaAssetId and listingTypeScope are omitted from the base before
// PartialType so each can be redeclared below as nullable (a plain
// `Partial<Create...>` only widens required -> optional, not
// optional-X -> optional-nullable — TypeScript rejects redeclaring an
// inherited property with a wider type).
export class UpdateContentBlockDto extends PartialType(
  OmitType(CreateContentBlockDto, [
    'mediaAssetId',
    'listingTypeScope',
  ] as const),
) {
  // `null` is accepted to explicitly clear an existing block's image.
  // @IsOptional() makes class-validator treat both `undefined` and `null`
  // as "skip @IsUUID()", which is what lets a PATCH null out a non-hero
  // block's icon. Whether that's ALLOWED (i.e. not a hero) is a decision
  // that needs the block's *existing* type, which a DTO can't see — that
  // check lives in ContentBlocksService.update().
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  mediaAssetId?: string | null;

  // `null` (like `[]` on create) explicitly clears an existing promo
  // card's scope back to "every listing type" — ContentBlocksService
  // normalizes both to NULL. Whether that's allowed on the block's
  // (possibly also-changing) type is, again, a cross-field decision that
  // lives in ContentBlocksService.update(), not here.
  @ApiPropertyOptional({ enum: ListingType, isArray: true, nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(ListingType, { each: true })
  listingTypeScope?: ListingType[] | null;
}
