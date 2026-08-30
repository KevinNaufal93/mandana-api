import { PartialType } from '@nestjs/swagger';
import { CreateMovingAddonDto } from './create-moving-addon.dto';

export class UpdateMovingAddonDto extends PartialType(CreateMovingAddonDto) {}
