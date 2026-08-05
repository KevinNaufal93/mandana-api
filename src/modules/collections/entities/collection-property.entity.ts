import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Collection } from './collection.entity';
import { Property } from '../../properties/entities/property.entity';

@Entity('collection_properties')
export class CollectionProperty extends BaseEntity {
  @ManyToOne(() => Collection, (c) => c.collectionProperties, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collection_id' })
  collection!: Collection;

  @Column({ name: 'collection_id' })
  collectionId!: string;

  @ManyToOne(() => Property, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'property_id' })
  property!: Property;

  @Column({ name: 'property_id' })
  propertyId!: string;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;
}
