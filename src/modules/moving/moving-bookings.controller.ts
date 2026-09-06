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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { MovingBookingsService } from './moving-bookings.service';
import { MovingMapper } from './moving.mapper';
import { CreateMovingBookingDto } from './dto/create-moving-booking.dto';
import { QueryMovingBookingsDto } from './dto/query-moving-bookings.dto';
import { TransitionMovingBookingDto } from './dto/transition-moving-booking.dto';
import {
  MovingBookingAdminListResponseDto,
  MovingBookingAdminResponseDto,
  MovingBookingResponseDto,
} from './dto/moving-booking-response.dto';

// ─── Public controller ────────────────────────────────────────────────────────

@ApiTags('moving')
@Public()
@Controller('moving/bookings')
export class MovingBookingsController {
  constructor(
    private readonly bookingsService: MovingBookingsService,
    private readonly mapper: MovingMapper,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Capture a Moving Support booking — persists the configured order (truck, pickup, destinations, add-ons, price) the moment the customer commits to it, before the real conversation happens over WhatsApp.',
  })
  @ApiCreatedResponse({ type: MovingBookingResponseDto })
  async create(@Body() dto: CreateMovingBookingDto) {
    const booking = await this.bookingsService.create(dto);
    return this.mapper.toBookingDto(booking);
  }
}

// ─── Admin controller ─────────────────────────────────────────────────────────

@ApiTags('admin / moving')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/moving/bookings')
export class MovingBookingsAdminController {
  constructor(
    private readonly bookingsService: MovingBookingsService,
    private readonly mapper: MovingMapper,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List Moving Support bookings (paginated; filter by status, capture-date range, and free-text search over reference/customer name/phone/email; sortable by createdAt/reference/total)',
  })
  @ApiOkResponse({ type: MovingBookingAdminListResponseDto })
  async findAll(@Query() query: QueryMovingBookingsDto) {
    const { data, meta } = await this.bookingsService.findAllAdmin(query);
    return { data: data.map((b) => this.mapper.toBookingAdminDto(b)), meta };
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get a single Moving Support booking with its destinations and add-on lines',
  })
  @ApiOkResponse({ type: MovingBookingAdminResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const booking = await this.bookingsService.findOneOrFail(id);
    return this.mapper.toBookingAdminDto(booking);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update a booking’s internal note — status changes exclusively through /confirm, /reject, /cancel, /complete below',
  })
  @ApiOkResponse({ type: MovingBookingAdminResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionMovingBookingDto,
  ) {
    const booking = await this.bookingsService.update(id, dto);
    return this.mapper.toBookingAdminDto(booking);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Confirm a pending booking' })
  @ApiOkResponse({ type: MovingBookingAdminResponseDto })
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionMovingBookingDto,
    @CurrentUser() admin: User,
  ) {
    const booking = await this.bookingsService.confirm(id, dto, admin);
    return this.mapper.toBookingAdminDto(booking);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a pending booking' })
  @ApiOkResponse({ type: MovingBookingAdminResponseDto })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionMovingBookingDto,
  ) {
    const booking = await this.bookingsService.reject(id, dto);
    return this.mapper.toBookingAdminDto(booking);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a confirmed booking' })
  @ApiOkResponse({ type: MovingBookingAdminResponseDto })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionMovingBookingDto,
  ) {
    const booking = await this.bookingsService.cancel(id, dto);
    return this.mapper.toBookingAdminDto(booking);
  }

  @Patch(':id/complete')
  @ApiOperation({
    summary: 'Mark a confirmed booking as completed (move carried out)',
  })
  @ApiOkResponse({ type: MovingBookingAdminResponseDto })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionMovingBookingDto,
  ) {
    const booking = await this.bookingsService.complete(id, dto);
    return this.mapper.toBookingAdminDto(booking);
  }
}
