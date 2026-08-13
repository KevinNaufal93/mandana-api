import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { StorageBookingsService } from './storage-bookings.service';
import { StorageMapper } from './storage.mapper';
import { CreateStorageBookingDto } from './dto/create-storage-booking.dto';
import { QueryStorageBookingsDto } from './dto/query-storage-bookings.dto';
import { TransitionStorageBookingDto } from './dto/transition-storage-booking.dto';
import {
  StorageBookingAdminListResponseDto,
  StorageBookingAdminResponseDto,
  StorageBookingResponseDto,
} from './dto/storage-response.dto';

// ─── Public controller ────────────────────────────────────────────────────────

@ApiTags('storage')
@Public()
@Controller('storage/bookings')
export class StorageBookingsController {
  constructor(
    private readonly bookingsService: StorageBookingsService,
    private readonly mapper: StorageMapper,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Submit a Smart Storage booking request — status starts pending; an admin confirms it. Does not reserve a unit until confirmed.',
  })
  @ApiOkResponse({ type: StorageBookingResponseDto })
  async create(@Body() dto: CreateStorageBookingDto) {
    const booking = await this.bookingsService.create(dto);
    return this.mapper.toBookingDto(booking);
  }
}

// ─── Admin controller ─────────────────────────────────────────────────────────

@ApiTags('admin / storage')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/storage/bookings')
export class StorageBookingsAdminController {
  constructor(
    private readonly bookingsService: StorageBookingsService,
    private readonly mapper: StorageMapper,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List storage bookings (paginated, filterable by status/facility/unit type)',
  })
  @ApiOkResponse({ type: StorageBookingAdminListResponseDto })
  async findAll(@Query() query: QueryStorageBookingsDto) {
    const { data, meta } = await this.bookingsService.findAllAdmin(query);
    return { data: data.map((b) => this.mapper.toAdminBookingDto(b)), meta };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single storage booking' })
  @ApiOkResponse({ type: StorageBookingAdminResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const booking = await this.bookingsService.findOneOrFail(id);
    return this.mapper.toAdminBookingDto(booking);
  }

  @Patch(':id/confirm')
  @ApiOperation({
    summary:
      'Confirm a pending booking — atomically allocates the unit(s); 409 if not enough remain',
  })
  @ApiOkResponse({ type: StorageBookingAdminResponseDto })
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionStorageBookingDto,
    @CurrentUser() admin: User,
  ) {
    const booking = await this.bookingsService.confirm(id, dto, admin);
    return this.mapper.toAdminBookingDto(booking);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a pending booking' })
  @ApiOkResponse({ type: StorageBookingAdminResponseDto })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionStorageBookingDto,
  ) {
    const booking = await this.bookingsService.reject(id, dto);
    return this.mapper.toAdminBookingDto(booking);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary:
      'Cancel a confirmed booking — releases the unit(s) back to availability',
  })
  @ApiOkResponse({ type: StorageBookingAdminResponseDto })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionStorageBookingDto,
  ) {
    const booking = await this.bookingsService.cancel(id, dto);
    return this.mapper.toAdminBookingDto(booking);
  }

  @Patch(':id/complete')
  @ApiOperation({
    summary:
      'Mark a confirmed booking as completed (tenant moved out) — releases the unit(s)',
  })
  @ApiOkResponse({ type: StorageBookingAdminResponseDto })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionStorageBookingDto,
  ) {
    const booking = await this.bookingsService.complete(id, dto);
    return this.mapper.toAdminBookingDto(booking);
  }
}
