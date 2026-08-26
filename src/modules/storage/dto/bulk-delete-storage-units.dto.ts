import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/** Body for DELETE /admin/storage/units/bulk — the row-select counterpart
 * to BulkCreateStorageUnitsDto. Atomic: every id must exist or nothing is
 * deleted (see StorageUnitsService.bulkRemove), same "name what's missing,
 * don't partially apply" precedent as event-support booking item
 * resolution. */
export class BulkDeleteStorageUnitsDto {
  @ApiProperty({
    type: [String],
    description: 'StorageUnit ids to delete',
    minItems: 1,
    maxItems: 500,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID(4, { each: true })
  ids!: string[];
}
