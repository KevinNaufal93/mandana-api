import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { StorageFacility } from './storage-facility.entity';
import { StorageUnitType } from './storage-unit-type.entity';
import { StorageBookingStatus } from '../enums/storage-booking-status.enum';
import { StorageDurationUnit } from '../enums/storage-duration-unit.enum';
import { User } from '../../users/entities/user.entity';

/**
 * A customer's storage booking request. `facility`/`unitType` are RESTRICT
 * (not CASCADE, unlike StorageInventory) — a booking is a historical/
 * financial record that must not silently vanish or get orphaned if a
 * facility is later deleted, same rationale as PropertyImage.mediaAsset.
 */
@Entity('storage_bookings')
export class StorageBooking extends BaseEntity {
  @Column({ unique: true, length: 20 })
  reference!: string;

  @Column({ name: 'customer_name', length: 255 })
  customerName!: string;

  @Column({ length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @ManyToOne(() => StorageFacility, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'facility_id' })
  facility!: StorageFacility;

  @Column({ name: 'facility_id' })
  facilityId!: string;

  @ManyToOne(() => StorageUnitType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_type_id' })
  unitType!: StorageUnitType;

  @Column({ name: 'unit_type_id' })
  unitTypeId!: string;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  // Null on a weekly booking — see durationUnit/durationUnits below, which
  // are the source of truth for every booking. Kept (rather than replaced)
  // because it's still the honest answer for every monthly booking and
  // several readers (the WhatsApp template, admin exports) key off it.
  @Column({ name: 'duration_months', type: 'int', nullable: true })
  durationMonths!: number | null;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({
    name: 'duration_unit',
    type: 'enum',
    enum: StorageDurationUnit,
    default: StorageDurationUnit.MONTH,
  })
  durationUnit!: StorageDurationUnit;

  // The billable count in durationUnit's unit — weeks or months. The
  // generic sibling of durationMonths; unlike it, always set.
  @Column({ name: 'duration_units', type: 'int' })
  durationUnits!: number;

  // The rate actually applied per durationUnit, snapshotted at booking
  // time — the generic sibling of monthlyRate below.
  @Column({ name: 'unit_rate', type: 'int' })
  unitRate!: number;

  @Column({
    type: 'enum',
    enum: StorageBookingStatus,
    default: StorageBookingStatus.PENDING,
  })
  status!: StorageBookingStatus;

  // Money snapshotted at request time — a later rate change must never
  // rewrite a historical booking's price. Integer Rupiah, same rationale as
  // StorageUnitType.monthlyRate. Always set (even on a weekly booking) as
  // the reference monthly rate at booking time — unitRate above is what
  // was actually billed.
  @Column({ name: 'monthly_rate', type: 'int' })
  monthlyRate!: number;

  @Column({ type: 'int' })
  subtotal!: number;

  @Column({ name: 'discount_amount', type: 'int', default: 0 })
  discountAmount!: number;

  @Column({ type: 'int' })
  total!: number;

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote!: string | null;

  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt!: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'confirmed_by_id' })
  confirmedBy!: User | null;

  @Column({ name: 'confirmed_by_id', nullable: true, type: 'uuid' })
  confirmedById!: string | null;
}
