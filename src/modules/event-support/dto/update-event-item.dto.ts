import { PartialType } from '@nestjs/swagger';
import { CreateEventItemDto } from './create-event-item.dto';

/** Only accepted while the item's status is `draft` — see
 * EventItemsService.update(). `status` still isn't a field here; use
 * PATCH /admin/event-support/items/:id/status instead. */
export class UpdateEventItemDto extends PartialType(CreateEventItemDto) {}
