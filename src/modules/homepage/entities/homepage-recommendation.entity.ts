import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Property } from '../../properties/entities/property.entity';

@Unique(['propertyId'])
@Entity('homepage_recommendations')
export class HomepageRecommendation extends BaseEntity {
  @ManyToOne(() => Property, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'property_id' })
  property!: Property;

  @Column({ name: 'property_id' })
  propertyId!: string;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;
}
