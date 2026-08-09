import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Amenity } from './entities/amenity.entity';
import { CreateAmenityDto } from './dto/create-amenity.dto';
import { UpdateAmenityDto } from './dto/update-amenity.dto';
import { resolveUniqueSlug } from '../../common/utils/slugify';

@Injectable()
export class AmenitiesService {
  constructor(
    @InjectRepository(Amenity)
    private readonly repo: Repository<Amenity>,
  ) {}

  findAll(): Promise<Amenity[]> {
    return this.repo.find({
      order: { category: 'ASC', sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findOneOrFail(id: string): Promise<Amenity> {
    const amenity = await this.repo.findOne({ where: { id } });
    if (!amenity) throw new NotFoundException(`Amenity ${id} not found`);
    return amenity;
  }

  async create(dto: CreateAmenityDto): Promise<Amenity> {
    const slug = await resolveUniqueSlug(this.repo, dto.slug ?? dto.name);

    const amenity = this.repo.create({
      name: dto.name,
      slug,
      icon: dto.icon ?? null,
      category: dto.category ?? null,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.repo.save(amenity);
  }

  async update(id: string, dto: UpdateAmenityDto): Promise<Amenity> {
    const amenity = await this.findOneOrFail(id);

    const slug =
      dto.slug !== undefined || dto.name !== undefined
        ? await resolveUniqueSlug(
            this.repo,
            dto.slug ?? dto.name ?? amenity.name,
            id,
          )
        : undefined;

    Object.assign(amenity, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(slug !== undefined && { slug }),
      ...(dto.icon !== undefined && { icon: dto.icon ?? null }),
      ...(dto.category !== undefined && { category: dto.category ?? null }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
    });

    return this.repo.save(amenity);
  }

  async remove(id: string): Promise<void> {
    const amenity = await this.findOneOrFail(id);
    await this.repo.remove(amenity);
  }
}
