import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ListingType } from '../enums/listing-type.enum';
import { PropertyStatus } from '../enums/property-status.enum';
import { PropertyType } from './property-type.entity';
import { PropertyImage } from './property-image.entity';

@Entity('properties')
export class Property extends BaseEntity {
  @Index({ unique: true })
  @Column({ unique: true, length: 255 })
  slug!: string;

  @Column({ length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

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

  @Column({ name: 'area_sqm', type: 'numeric', precision: 10, scale: 2, nullable: true })
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
}
