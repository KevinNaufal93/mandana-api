import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Singleton row holding the Smart Storage pricing policy — currently just
 * the insurance premium percentage applied on top of every quote/booking's
 * rent (`total = subtotal + round(subtotal * insurancePct / 100, roundToIdr)`
 * — see storage-pricing.ts). Modelled directly on MovingSettings
 * (moving-settings.entity.ts) — same singleton/UNIQUE/CHECK shape.
 *
 * `singleton` + its UNIQUE constraint + a DB-level CHECK (singleton = true)
 * make a second row physically impossible — see the migration.
 */
@Entity('storage_settings')
export class StorageSettings extends BaseEntity {
  @Column({ default: true })
  singleton!: boolean;

  @Column({ name: 'insurance_pct', type: 'int', default: 0 })
  insurancePct!: number;

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
