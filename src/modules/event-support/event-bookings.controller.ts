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
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { EventBookingsService } from './event-bookings.service';
import { EventSupportMapper } from './event-support.mapper';
import { CreateEventBookingDto } from './dto/create-event-booking.dto';
import { QueryEventBookingsDto } from './dto/query-event-bookings.dto';
import { TransitionEventBookingDto } from './dto/transition-event-booking.dto';
import {
  EventBookingAdminListResponseDto,
  EventBookingAdminResponseDto,
} from './dto/event-support-response.dto';

/**
 * Admin-only — there is no public booking endpoint. Every real booking
 * happens over WhatsApp (see POST /event-support/quote); this controller is
 * how the admin who took that conversation records it, which also attaches
 * the `createdBy` audit trail the product asked for.
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
      'List event-support bookings (paginated, filterable by status/date range/search)',
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
