import {
  Body,
  Controller,
  Delete,
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
import { UserRole } from '../users/enums/user-role.enum';
import { EventCategoriesService } from './event-categories.service';
import { EventItemsService } from './event-items.service';
import { EventAvailabilityService } from './event-availability.service';
import { EventSupportSettingsService } from './event-support-settings.service';
import { EventSupportMapper } from './event-support.mapper';
import { windowEndDate, windowStartDate } from './event-pricing';
import { CreateEventCategoryDto } from './dto/create-event-category.dto';
import { UpdateEventCategoryDto } from './dto/update-event-category.dto';
import { QueryEventCategoriesDto } from './dto/query-event-categories.dto';
import { CreateEventItemDto } from './dto/create-event-item.dto';
import { UpdateEventItemDto } from './dto/update-event-item.dto';
import { TransitionEventItemStatusDto } from './dto/transition-event-item-status.dto';
import { QueryEventItemsDto } from './dto/query-event-items.dto';
import { QueryAdminEventItemsDto } from './dto/query-admin-event-items.dto';
import { QuoteEventSupportDto } from './dto/quote-event-support.dto';
import {
  EventCategoryListResponseDto,
  EventCategoryResponseDto,
  EventItemAdminListResponseDto,
  EventItemAdminResponseDto,
  EventItemDetailResponseDto,
  EventItemListResponseDto,
  EventQuoteResponseDto,
  EventSupportSettingsResponseDto,
} from './dto/event-support-response.dto';

// ─── Public controller ────────────────────────────────────────────────────────

@ApiTags('event-support')
@Public()
@Controller('event-support')
export class EventSupportController {
  constructor(
    private readonly categoriesService: EventCategoriesService,
    private readonly itemsService: EventItemsService,
    private readonly availability: EventAvailabilityService,
    private readonly settingsService: EventSupportSettingsService,
    private readonly mapper: EventSupportMapper,
  ) {}

  @Get('categories')
  @ApiOperation({
    summary: 'List active event-support categories (the catalog tabs)',
  })
  @ApiOkResponse({ type: EventCategoryListResponseDto })
  async findAllCategories() {
    const categories = await this.categoriesService.findAllPublic();
    return categories.map((c) => this.mapper.toCategoryDto(c));
  }

  @Get('pricing-config')
  @ApiOperation({
    summary:
      'Hourly-pricing policy (threshold, rounding step, minimum hours, ...) — fetch these instead of hardcoding them client-side',
  })
  @ApiOkResponse({ type: EventSupportSettingsResponseDto })
  async getPricingConfig() {
    const settings = await this.settingsService.get();
    return this.mapper.toSettingsDto(settings);
  }

  @Get('items')
  @ApiOperation({
    summary:
      "List published items, paginated. Pass ?dropoffAt&pickupAt for each item's live activeRate.",
  })
  @ApiOkResponse({ type: EventItemListResponseDto })
  async findAllItems(@Query() query: QueryEventItemsDto) {
    const { data, meta } = await this.itemsService.findAllPublic(query);
    const activeRates = await this.itemsService.resolveActiveRates(
      data,
      query.dropoffAt,
      query.pickupAt,
    );
    return {
      data: data.map((i) =>
        this.mapper.toItemListDto(i, activeRates.get(i.id)),
      ),
      meta,
    };
  }

  @Get('items/:slug')
  @ApiOperation({
    summary:
      'Get a single published item with full description. Optional ?dropoffAt&pickupAt adds availableQuantity and activeRate.',
  })
  @ApiOkResponse({ type: EventItemDetailResponseDto })
  async findOneItem(
    @Param('slug') slug: string,
    @Query() query: QueryEventItemsDto,
  ) {
    const item = await this.itemsService.findOneBySlugPublicOrFail(slug);

    let availableQuantity: number | null = null;
    if (query.dropoffAt && query.pickupAt) {
      availableQuantity = await this.availability.getAvailableQuantity(
        item.id,
        item.stockQuantity,
        windowStartDate(query.dropoffAt),
        windowEndDate(query.pickupAt),
      );
    }

    const activeRates = await this.itemsService.resolveActiveRates(
      [item],
      query.dropoffAt,
      query.pickupAt,
    );

    return this.mapper.toItemDetailDto(
      item,
      availableQuantity,
      activeRates.get(item.id),
    );
  }

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Compute an authoritative price for a cart and return a prefilled WhatsApp message. Writes nothing — the actual booking is made over WhatsApp and later recorded by an admin.',
  })
  @ApiOkResponse({ type: EventQuoteResponseDto })
  async quote(@Body() dto: QuoteEventSupportDto) {
    const [computed, settings] = await Promise.all([
      this.itemsService.quote(dto),
      this.settingsService.get(),
    ]);
    return this.mapper.toQuoteDto(computed, settings);
  }
}

// ─── Admin controller ─────────────────────────────────────────────────────────

@ApiTags('admin / event-support')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/event-support')
export class EventSupportAdminController {
  constructor(
    private readonly categoriesService: EventCategoriesService,
    private readonly itemsService: EventItemsService,
    private readonly mapper: EventSupportMapper,
  ) {}

  // ── Categories ────────────────────────────────────────────────────────

  @Get('categories')
  @ApiOperation({
    summary: 'List all event-support categories, including inactive',
  })
  @ApiOkResponse({ type: EventCategoryListResponseDto })
  async findAllCategories(@Query() query: QueryEventCategoriesDto) {
    const categories = await this.categoriesService.findAllAdmin(
      query.isActive,
    );
    return categories.map((c) => this.mapper.toCategoryDto(c));
  }

  @Get('categories/:id')
  @ApiOperation({ summary: 'Get a single event-support category' })
  @ApiOkResponse({ type: EventCategoryResponseDto })
  async findCategory(@Param('id', ParseUUIDPipe) id: string) {
    const category = await this.categoriesService.findOneWithCountOrFail(id);
    return this.mapper.toCategoryDto(category);
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create an event-support category' })
  @ApiCreatedResponse({ type: EventCategoryResponseDto })
  async createCategory(@Body() dto: CreateEventCategoryDto) {
    const category = await this.categoriesService.create(dto);
    return this.mapper.toCategoryDto(category);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Update an event-support category' })
  @ApiOkResponse({ type: EventCategoryResponseDto })
  async updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventCategoryDto,
  ) {
    const category = await this.categoriesService.update(id, dto);
    return this.mapper.toCategoryDto(category);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an event-support category (409 if it still has items)',
  })
  async removeCategory(@Param('id', ParseUUIDPipe) id: string) {
    await this.categoriesService.remove(id);
  }

  // ── Items ─────────────────────────────────────────────────────────────

  @Get('items')
  @ApiOperation({
    summary:
      'List all event-support items, any status, paginated and filterable',
  })
  @ApiOkResponse({ type: EventItemAdminListResponseDto })
  async findAllItems(@Query() query: QueryAdminEventItemsDto) {
    const { data, meta } = await this.itemsService.findAllAdmin(query);
    return { data: data.map((i) => this.mapper.toItemAdminDto(i)), meta };
  }

  @Get('items/:id')
  @ApiOperation({ summary: 'Get a single event-support item' })
  @ApiOkResponse({ type: EventItemAdminResponseDto })
  async findItem(@Param('id', ParseUUIDPipe) id: string) {
    const item = await this.itemsService.findOneOrFail(id);
    return this.mapper.toItemAdminDto(item);
  }

  @Post('items')
  @ApiOperation({
    summary: 'Create an event-support item — always starts as draft',
  })
  @ApiCreatedResponse({ type: EventItemAdminResponseDto })
  async createItem(@Body() dto: CreateEventItemDto) {
    const item = await this.itemsService.create(dto);
    return this.mapper.toItemAdminDto(item);
  }

  @Patch('items/:id')
  @ApiOperation({
    summary: 'Update an event-support item — only allowed while it is draft',
  })
  @ApiOkResponse({ type: EventItemAdminResponseDto })
  async updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventItemDto,
  ) {
    const item = await this.itemsService.update(id, dto);
    return this.mapper.toItemAdminDto(item);
  }

  @Patch('items/:id/status')
  @ApiOperation({
    summary:
      'Move an item between draft / published / archived. The only way to change status.',
  })
  @ApiOkResponse({ type: EventItemAdminResponseDto })
  async updateItemStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionEventItemStatusDto,
  ) {
    const item = await this.itemsService.updateStatus(id, dto);
    return this.mapper.toItemAdminDto(item);
  }

  @Delete('items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an event-support item (409 if referenced by any booking)',
  })
  async removeItem(@Param('id', ParseUUIDPipe) id: string) {
    await this.itemsService.remove(id);
  }
}
