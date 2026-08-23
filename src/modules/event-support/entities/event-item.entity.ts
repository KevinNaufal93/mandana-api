import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { EventCategory } from './event-category.entity';
import { EventItemKind } from '../enums/event-item-kind.enum';
import { EventItemStatus } from '../enums/event-item-status.enum';
import { MediaAsset } from '../../media/entities/media-asset.entity';

/**
 * A rentable package or add-on within a category (e.g. "Medium Venue
 * Package" under Sound System). `category` is RESTRICT — a category with
 * items in it must be emptied before it can be deleted, same rationale as
 * StorageBooking.facility.
 *
 * `stockQuantity` is a static pool; real availability on a date range is
 * derived at query time from confirmed EventBookingItem lines — see
 * EventAvailabilityService. This column is never decremented directly.
 */
@Entity('event_items')
@Index('idx_event_items_category_status', ['categoryId', 'status', 'sortOrder'])
export class EventItem extends BaseEntity {
  @ManyToOne(() => EventCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category!: EventCategory;

  @Column({ name: 'category_id' })
  categoryId!: string;

  @Column({ length: 180 })
  name!: string;

  @Column({ unique: true, length: 180 })
  slug!: string;

  @Column({ type: 'enum', enum: EventItemKind, default: EventItemKind.PACKAGE })
  kind!: EventItemKind;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  // Rupiah as integer — same rationale as StorageUnitType.monthlyRate.
  @Column({ name: 'price_per_day', type: 'int' })
  pricePerDay!: number;

  @Column({ name: 'stock_quantity', type: 'int', default: 0 })
  stockQuantity!: number;

  @Column({
    type: 'enum',
    enum: EventItemStatus,
    default: EventItemStatus.DRAFT,
  })
  status!: EventItemStatus;

  @ManyToOne(() => MediaAsset, {
    nullable: true,
    eager: false,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'media_asset_id' })
  mediaAsset!: MediaAsset | null;

  @Column({ name: 'media_asset_id', nullable: true })
  mediaAssetId!: string | null;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;
}
