import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from './entities/property.entity';
import { PropertyType } from './entities/property-type.entity';
import { QueryPropertiesDto } from './dto/query-properties.dto';
import { PropertyStatus } from './enums/property-status.enum';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Property)
    private readonly propertiesRepo: Repository<Property>,
    @InjectRepository(PropertyType)
    private readonly propertyTypesRepo: Repository<PropertyType>,
  ) {}

  async findAll(query: QueryPropertiesDto): Promise<PaginatedResult<Property>> {
    const { page, limit, listingType, city, propertyTypeSlug, minPrice, maxPrice, isFeatured } = query;

    const qb = this.propertiesRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.images', 'img')
      .leftJoinAndSelect('p.propertyType', 'pt')
      .where('p.status = :status', { status: PropertyStatus.PUBLISHED });

    if (listingType) qb.andWhere('p.listingType = :listingType', { listingType });
    if (city) qb.andWhere('LOWER(p.city) LIKE :city', { city: `%${city.toLowerCase()}%` });
    if (propertyTypeSlug) qb.andWhere('pt.slug = :propertyTypeSlug', { propertyTypeSlug });
    if (minPrice !== undefined) qb.andWhere('p.price >= :minPrice', { minPrice });
    if (maxPrice !== undefined) qb.andWhere('p.price <= :maxPrice', { maxPrice });
    if (isFeatured !== undefined) qb.andWhere('p.isFeatured = :isFeatured', { isFeatured });

    const offset = (page - 1) * limit;
    qb.orderBy('p.createdAt', 'DESC').skip(offset).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findBySlug(slug: string): Promise<Property> {
    const property = await this.propertiesRepo.findOne({
      where: { slug, status: PropertyStatus.PUBLISHED },
      relations: { images: true, propertyType: true },
    });
    if (!property) throw new NotFoundException(`Property '${slug}' not found`);
    return property;
  }

  findAllTypes(): Promise<PropertyType[]> {
    return this.propertyTypesRepo.find({ order: { name: 'ASC' } });
  }
}
