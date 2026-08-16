import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { StorageFacility } from './storage-facility.entity';
import { StorageUnitType } from './storage-unit-type.entity';
import { StorageBooking } from './storage-booking.entity';
import { StorageUnitStatus } from '../enums/storage-unit-status.enum';

/**
 * One row per physical storage unit — the floor-plan tile. `code` is the
 * stable, human-facing identifier ("A-01") a customer reads over WhatsApp;
 * never renumber it. Position columns are nullable on purpose: the FE packs
 * a placement locally until an admin surveys and fills in the real grid
 * position, which needs no migration since the columns already exist.
 *
 * `storage_inventory`'s totals are derived from counting these rows — this
 * table is the single source of truth for "how many units exist" and "which
 * ones are free." See StorageBookingsService.confirm() for why claiming
 * specific rows needs `SELECT ... FOR UPDATE SKIP LOCKED`, not a plain
 * read-modify-write.
 */
@Entity('storage_units')
@Unique('UQ_storage_units_facility_code', ['facilityId', 'code'])
@Index('idx_storage_units_facility_type_status', [
  'facilityId',
  'unitTypeId',
  'status',
])
export class StorageUnit extends BaseEntity {
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

  @Column({ length: 20 })
  code!: string;

  // Populated in a later phase — null here means "use the FE's local packer."
  @Column({ name: 'grid_column', type: 'int', nullable: true })
  gridColumn!: number | null;

  @Column({ name: 'grid_row', type: 'int', nullable: true })
  gridRow!: number | null;

  @Column({ name: 'column_span', type: 'int', nullable: true })
  columnSpan!: number | null;

  @Column({ name: 'row_span', type: 'int', nullable: true })
  rowSpan!: number | null;

  @Column({
    type: 'enum',
    enum: StorageUnitStatus,
    default: StorageUnitStatus.AVAILABLE,
  })
  status!: StorageUnitStatus;

  // Set only while status = occupied; cleared on cancel/complete.
  @ManyToOne(() => StorageBooking, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'booking_id' })
  booking!: StorageBooking | null;

  @Column({ name: 'booking_id', nullable: true, type: 'uuid' })
  bookingId!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
