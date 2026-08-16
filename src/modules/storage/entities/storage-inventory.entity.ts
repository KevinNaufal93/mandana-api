import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { StorageFacility } from './storage-facility.entity';
import { StorageUnitType } from './storage-unit-type.entity';

/**
 * The facility × unit type pairing config — "is this size offered here, and
 * at what rate." Unit counts are NOT stored here: they're derived by
 * counting `storage_unit` rows, which is the single source of truth for
 * capacity and occupancy. This table used to also carry `totalUnits`/
 * `occupiedUnits`, but keeping both independently writable was exactly the
 * drift bug the floor-plan work exists to avoid — see
 * docs/storage-floor-plan-response.md §3.
 */
@Entity('storage_inventory')
@Unique('UQ_storage_inventory_facility_unit_type', ['facilityId', 'unitTypeId'])
export class StorageInventory extends BaseEntity {
  @ManyToOne(() => StorageFacility, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'facility_id' })
  facility!: StorageFacility;

  @Column({ name: 'facility_id' })
  facilityId!: string;

  @ManyToOne(() => StorageUnitType, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_type_id' })
  unitType!: StorageUnitType;

  @Column({ name: 'unit_type_id' })
  unitTypeId!: string;

  // Overrides StorageUnitType.monthlyRate for this facility (e.g. a premium
  // location). Null = use the unit type's base rate.
  @Column({ name: 'monthly_rate_override', type: 'int', nullable: true })
  monthlyRateOverride!: number | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
