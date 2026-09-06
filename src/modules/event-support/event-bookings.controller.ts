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
import { EventBookingsService } from './event-bookings.service';
import { EventSupportMapper } from './event-support.mapper';
import { CreateEventBookingDto } from './dto/create-event-booking.dto';
import { CreatePublicEventBookingDto } from './dto/create-public-event-booking.dto';
import { QueryEventBookingsDto } from './dto/query-event-bookings.dto';
import { TransitionEventBookingDto } from './dto/transition-event-booking.dto';
import {
  EventBookingAdminListResponseDto,
  EventBookingAdminResponseDto,
  EventBookingPublicResponseDto,
} from './dto/event-support-response.dto';

// ─── Public controller ────────────────────────────────────────────────────────

@ApiTags('event-support')
@Public()
@Controller('event-support/bookings')
export class EventBookingsController {
  constructor(
    private readonly bookingsService: EventBookingsService,
    private readonly mapper: EventSupportMapper,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Submit an Event Support booking request — status starts pending; an admin confirms it. Prices the same cart POST /event-support/quote would, and does not reserve stock until confirmed.',
  })
  @ApiCreatedResponse({ type: EventBookingPublicResponseDto })
  async create(@Body() dto: CreatePublicEventBookingDto) {
    const { booking, quote, settings } =
      await this.bookingsService.createPublic(dto);
    return this.mapper.toBookingPublicDto(booking, quote, settings);
  }
}

// ─── Admin controller ─────────────────────────────────────────────────────────

/**
 * Two ways a booking reaches this table: a customer submits one directly
 * (see EventBookingsController above, `source: 'public'`), or an admin
 * records one after a WhatsApp conversation (`source: 'admin'`, attaching
 * the `createdBy` audit trail the product asked for).
 */
@ApiTags('admin / event-support')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/event-support/bookings')
export class EventBookingsAdminController {
  constructor(
    private readonly bookingsService: EventBookingsService,
    private readonly mapper: EventSupportMapper,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List event-support bookings (paginated; filter by status, capture-date range, event-window range, and free-text search over reference/customer name/phone/email; sortable by createdAt/reference/total/startDate). BREAKING CHANGE: from/to now filter by capture date (createdAt) — the old event-window filter is startFrom/startTo.',
  })
  @ApiOkResponse({ type: EventBookingAdminListResponseDto })
  async findAll(@Query() query: QueryEventBookingsDto) {
    const { data, meta } = await this.bookingsService.findAllAdmin(query);
    return { data: data.map((b) => this.mapper.toBookingAdminDto(b)), meta };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single event-support booking with its lines',
  })
  @ApiOkResponse({ type: EventBookingAdminResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const booking = await this.bookingsService.findOneOrFail(id);
    return this.mapper.toBookingAdminDto(booking);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Record a booking made over WhatsApp — status starts pending; confirming it is a separate step. Does not reserve stock until confirmed.',
  })
  @ApiCreatedResponse({ type: EventBookingAdminResponseDto })
  async create(@Body() dto: CreateEventBookingDto, @CurrentUser() admin: User) {
    const booking = await this.bookingsService.create(dto, admin);
    return this.mapper.toBookingAdminDto(booking);
  }

  @Patch(':id/confirm')
  @ApiOperation({
    summary:
      'Confirm a pending booking — atomically re-checks availability; 409 if any line no longer has enough stock',
  })
  @ApiOkResponse({ type: EventBookingAdminResponseDto })
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionEventBookingDto,
    @CurrentUser() admin: User,
  ) {
    const booking = await this.bookingsService.confirm(id, dto, admin);
    return this.mapper.toBookingAdminDto(booking);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary:
      'Cancel a pending or confirmed booking — releases any stock it held',
  })
  @ApiOkResponse({ type: EventBookingAdminResponseDto })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionEventBookingDto,
  ) {
    const booking = await this.bookingsService.cancel(id, dto);
    return this.mapper.toBookingAdminDto(booking);
  }

  @Patch(':id/complete')
  @ApiOperation({
    summary:
      'Mark a confirmed booking as completed (event over, equipment returned) — releases its stock',
  })
  @ApiOkResponse({ type: EventBookingAdminResponseDto })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionEventBookingDto,
  ) {
    const booking = await this.bookingsService.complete(id, dto);
    return this.mapper.toBookingAdminDto(booking);
  }
}
