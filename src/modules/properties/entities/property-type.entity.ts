import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Property } from './property.entity';

@Entity('property_types')
export class PropertyType extends BaseEntity {
  @Column({ length: 100 })
  name!: string;

  @Column({ unique: true, length: 100 })
  slug!: string;

  @OneToMany(() => Property, (p) => p.propertyType)
  properties!: Property[];
}
