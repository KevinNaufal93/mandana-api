import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Singleton row holding the Smart Storage pricing policy — currently just
 * the insurance premium rate applied to a booking's *declared goods value*,
 * not its rent (`total = subtotal + round(declaredValue * insuranceBps /
 * 10_000, roundToIdr)` — see storage-pricing.ts). Modelled directly on
 * MovingSettings (moving-settings.entity.ts) — same singleton/UNIQUE/CHECK
 * shape.
 *
 * `singleton` + its UNIQUE constraint + a DB-level CHECK (singleton = true)
 * make a second row physically impossible — see the migration.
 */
@Entity('storage_settings')
export class StorageSettings extends BaseEntity {
  @Column({ default: true })
  singleton!: boolean;

  /** Basis points, e.g. `50` = 0.5% — stored as an integer so a sub-1% rate
   *  is representable (unlike the old whole-percent `insurance_pct`, which
   *  this migrated from; see StorageInsuranceOnDeclaredValue1790400000000).
   *  The admin form and response DTO convert to/from a percent — see
   *  StorageSettingsService. */
  @Column({ name: 'insurance_bps', type: 'int', default: 0 })
  insuranceBps!: number;

  /**
   * Admin-entered WhatsApp number for Mandana Space, exactly as typed (the website
   * normalizes it for wa.me). Null = not set; the website then falls back to
   * the General number, then to its NEXT_PUBLIC_MANDANA_WHATSAPP env value.
   */
  @Column({
    name: 'whatsapp_number',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  whatsappNumber!: string | null;
}
