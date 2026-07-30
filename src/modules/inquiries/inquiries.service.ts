import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inquiry } from './entities/inquiry.entity';
import { CreateInquiryDto } from './dto/create-inquiry.dto';

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
}
