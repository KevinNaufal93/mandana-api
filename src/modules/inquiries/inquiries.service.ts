import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inquiry } from './entities/inquiry.entity';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { QueryInquiriesDto } from './dto/query-inquiries.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { FindOptionsWhere } from 'typeorm';

@Injectable()
export class InquiriesService {
  constructor(
    @InjectRepository(Inquiry)
    private readonly inquiriesRepo: Repository<Inquiry>,
  ) {}

  create(dto: CreateInquiryDto): Promise<Inquiry> {
    const inquiry = this.inquiriesRepo.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone ?? null,
      message: dto.message,
      propertyId: dto.propertyId ?? null,
    });
    return this.inquiriesRepo.save(inquiry);
  }

  async findAll(query: QueryInquiriesDto): Promise<PaginatedResult<Inquiry>> {
    const { page, limit, propertyId } = query;

    const where: FindOptionsWhere<Inquiry> = {};
    if (propertyId) where.propertyId = propertyId;

    const [data, total] = await this.inquiriesRepo.findAndCount({
      where,
      relations: { property: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string): Promise<Inquiry> {
    const inquiry = await this.inquiriesRepo.findOne({
      where: { id },
      relations: { property: true },
    });
    if (!inquiry) throw new NotFoundException(`Inquiry ${id} not found`);
    return inquiry;
  }

  async remove(id: string): Promise<void> {
    const inquiry = await this.inquiriesRepo.findOne({ where: { id } });
    if (!inquiry) throw new NotFoundException(`Inquiry ${id} not found`);
    await this.inquiriesRepo.remove(inquiry);
  }
}
