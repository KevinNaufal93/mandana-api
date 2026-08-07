import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { InquiriesService } from './inquiries.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { QueryInquiriesDto } from './dto/query-inquiries.dto';

// ─── Public controller ────────────────────────────────────────────────────────

@ApiTags('inquiries')
@Public()
@Controller('inquiries')
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a contact / property inquiry' })
  create(@Body() dto: CreateInquiryDto) {
    return this.inquiriesService.create(dto);
  }
}

// ─── Admin controller ─────────────────────────────────────────────────────────

@ApiTags('admin / inquiries')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/inquiries')
export class InquiriesAdminController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Get()
  @ApiOperation({ summary: 'List all inquiries (paginated)' })
  findAll(@Query() query: QueryInquiriesDto) {
    return this.inquiriesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single inquiry' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.inquiriesService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an inquiry' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.inquiriesService.remove(id);
  }
}
