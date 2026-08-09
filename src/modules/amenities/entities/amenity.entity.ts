import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('amenities')
export class Amenity extends BaseEntity {
  @Column({ length: 100 })
  name!: string;

  @Column({ unique: true, length: 100 })
  slug!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  icon!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category!: string | null;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;
}
