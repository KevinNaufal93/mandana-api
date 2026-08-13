import { PartialType } from '@nestjs/swagger';
import { CreateStorageInventoryDto } from './create-storage-inventory.dto';

export class UpdateStorageInventoryDto extends PartialType(
  CreateStorageInventoryDto,
) {}
