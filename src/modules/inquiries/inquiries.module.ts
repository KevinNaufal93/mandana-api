import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inquiry } from './entities/inquiry.entity';
import { InquiriesService } from './inquiries.service';
import {
  InquiriesController,
  InquiriesAdminController,
} from './inquiries.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Inquiry])],
  providers: [InquiriesService],
  controllers: [InquiriesController, InquiriesAdminController],
})
export class InquiriesModule {}
