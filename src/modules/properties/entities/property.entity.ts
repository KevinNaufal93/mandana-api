import {
  Column,
  Entity,
  ManyToOne,
  ManyToMany,
  OneToMany,
  JoinColumn,
  JoinTable,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ListingType } from '../enums/listing-type.enum';
import { PropertyStatus } from '../enums/property-status.enum';
import { PropertyType } from './property-type.entity';
import { PropertyImage } from './property-image.entity';
import { User } from '../../users/entities/user.entity';
import { Amenity } from '../../amenities/entities/amenity.entity';

@Entity('properties')
export class Property extends BaseEntity {
  @Index({ unique: true })
  @Column({ unique: true, length: 255 })
  slug!: string;

  @Column({ length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /**
   * Plain-text derivative of `description` (HTML stripped), kept in sync on
   * every write. Exists solely so the FTS index (see migration
   * `1786320000000-AddPropertySearchIndex`, later repointed at this column)
   * indexes real words instead of markup tokens like "strong" or "li".
   */
  @Column({ name: 'description_text', type: 'text', nullable: true })
  descriptionText!: string | null;

  @Column({
    name: 'listing_type',
    type: 'enum',
    enum: ListingType,
    default: ListingType.SALE,
  })
  listingType!: ListingType;

  @Column({
    type: 'enum',
    enum: PropertyStatus,
    default: PropertyStatus.DRAFT,
  })
  status!: PropertyStatus;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  price!: number;

  @Column({ length: 3, default: 'IDR' })
  currency!: string;

  @Column({ type: 'int', nullable: true })
  bedrooms!: number | null;

  @Column({ type: 'int', nullable: true })
  bathrooms!: number | null;

  @Column({
    name: 'area_sqm',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  areaSqm!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  area!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  province!: string | null;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true })
  latitude!: number | null;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true })
  longitude!: number | null;

  @Column({ name: 'is_featured', default: false })
  isFeatured!: boolean;

  @ManyToOne(() => PropertyType, (pt) => pt.properties, { nullable: true })
  @JoinColumn({ name: 'property_type_id' })
  propertyType!: PropertyType | null;

  @Column({ name: 'property_type_id', nullable: true })
  propertyTypeId!: string | null;

  @OneToMany(() => PropertyImage, (img) => img.property, { cascade: true })
  images!: PropertyImage[];

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'agent_id' })
  agent!: User | null;

  @Column({ name: 'agent_id', nullable: true, type: 'uuid' })
  agentId!: string | null;

  @ManyToMany(() => Amenity)
  @JoinTable({
    name: 'property_amenities',
    joinColumn: { name: 'property_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'amenity_id', referencedColumnName: 'id' },
  })
  amenities!: Amenity[];
}
