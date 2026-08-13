import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { StorageFacility } from './storage-facility.entity';
import { StorageUnitType } from './storage-unit-type.entity';

/**
 * The pooled unit count for one facility × unit type pair. Availability is
 * `totalUnits - occupiedUnits`, computed in the mapper — never stored.
 *
 * `occupiedUnits` must stay within `[0, totalUnits]`. The migration adds a DB
 * `CHECK` constraint as the final backstop, but the real guard is the atomic
 * conditional `UPDATE` in StorageBookingsService (confirm/cancel/complete) —
 * see that file for why a plain read-modify-write here would allow overselling.
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

  @Column({ name: 'total_units', type: 'int' })
  totalUnits!: number;

  @Column({ name: 'occupied_units', type: 'int', default: 0 })
  occupiedUnits!: number;

  // Overrides StorageUnitType.monthlyRate for this facility (e.g. a premium
  // location). Null = use the unit type's base rate.
  @Column({ name: 'monthly_rate_override', type: 'int', nullable: true })
  monthlyRateOverride!: number | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
