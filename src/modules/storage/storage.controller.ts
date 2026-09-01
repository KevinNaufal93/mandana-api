import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { AuthService } from '../auth/auth.service';
import { JwtStreamGuard } from '../auth/guards/jwt-stream.guard';
import { StorageService } from './storage.service';
import { StorageAvailabilityService } from './storage-availability.service';
import { StorageMapper } from './storage.mapper';
import { CreateStorageUnitTypeDto } from './dto/create-storage-unit-type.dto';
import { UpdateStorageUnitTypeDto } from './dto/update-storage-unit-type.dto';
import { CreateStorageFacilityDto } from './dto/create-storage-facility.dto';
import { UpdateStorageFacilityDto } from './dto/update-storage-facility.dto';
import { CreateStorageInventoryDto } from './dto/create-storage-inventory.dto';
import { UpdateStorageInventoryDto } from './dto/update-storage-inventory.dto';
import { QueryStorageActiveDto } from './dto/query-storage-active.dto';
import { QueryStorageInventoryDto } from './dto/query-storage-inventory.dto';
import { QuoteStorageDto } from './dto/quote-storage.dto';
import {
  StorageAvailabilityResponseDto,
  StorageFacilityListResponseDto,
  StorageFacilityResponseDto,
  StorageInventoryListResponseDto,
  StorageInventoryResponseDto,
  StorageQuoteResponseDto,
  StorageStreamTicketResponseDto,
  StorageUnitTypeListResponseDto,
  StorageUnitTypeResponseDto,
} from './dto/storage-response.dto';

// ─── Public controller ────────────────────────────────────────────────────────

@ApiTags('storage')
@Public()
@Controller('storage')
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly availability: StorageAvailabilityService,
    private readonly mapper: StorageMapper,
  ) {}

  @Get('unit-types')
  @ApiOperation({
    summary:
      'List active storage unit types (sizes) for the Smart Storage page',
  })
  @ApiOkResponse({ type: StorageUnitTypeListResponseDto })
  async findAllUnitTypes() {
    const unitTypes = await this.storageService.findAllUnitTypesPublic();
    return unitTypes.map((u) => this.mapper.toUnitTypeDto(u));
  }

  @Get('facilities')
  @ApiOperation({
    summary: 'List active storage facilities with coordinates, for the map',
  })
  @ApiOkResponse({ type: StorageFacilityListResponseDto })
  async findAllFacilities() {
    const facilities = await this.storageService.findAllFacilitiesPublic();
    return facilities.map((f) => this.mapper.toFacilityDto(f));
  }

  @Get('facilities/:slug')
  @ApiOperation({ summary: 'Get a single active storage facility by slug' })
  @ApiOkResponse({ type: StorageFacilityResponseDto })
  async findFacility(@Param('slug') slug: string) {
    const facility = await this.storageService.findFacilityBySlugOrFail(slug);
    return this.mapper.toFacilityDto(facility);
  }

  @Get('availability')
  @ApiOperation({
    summary:
      'Current availability snapshot, with ETag/304 support — polling fallback for the SSE stream',
  })
  @ApiOkResponse({ type: StorageAvailabilityResponseDto })
  async getAvailability(@Res() res: Response): Promise<void> {
    const snapshot = await this.availability.getSnapshot();
    const etag = `"${snapshot.version}"`;

    // Must not `return` the res.status()/.json()/.end() chain — Response
    // methods return `this` for chaining, and while @Res() puts Nest in
    // "manual mode" (it never sends that return value itself), the value
    // still flows through the global ClassSerializerInterceptor first.
    // That calls class-transformer on it, which recurses into a live
    // Express/Node Response — circular refs into the raw socket — and
    // throws deep inside Node's own http internals (`this.removeListener
    // is not a function` in node:_http_server's socketOnError). Ending
    // each branch on its own statement keeps the handler's resolved value
    // `undefined`, which every interceptor in the chain passes through
    // untouched (ClassSerializerInterceptor.serialize bails out on
    // anything that isn't an object; TransformInterceptor wraps it as
    // `{ data: undefined }`, itself never sent — see the identical fix in
    // HomepageController.getHomepage()).
    if (res.req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res
      .set('ETag', etag)
      .set('Cache-Control', 'no-cache')
      .json({ data: snapshot });
  }

  @SkipTransform()
  @Sse('availability/stream')
  @ApiOperation({
    summary:
      'SSE stream of availability snapshots (counts only) + periodic ping. Public — never carries customer data.',
  })
  stream(): Observable<MessageEvent> {
    return this.availability.publicStream();
  }

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Compute an authoritative price for a unit type + facility + duration',
  })
  @ApiOkResponse({ type: StorageQuoteResponseDto })
  quote(@Body() dto: QuoteStorageDto) {
    return this.storageService.quote(dto);
  }
}

// ─── Admin controller ─────────────────────────────────────────────────────────

@ApiTags('admin / storage')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/storage')
export class StorageAdminController {
  constructor(
    private readonly storageService: StorageService,
    private readonly authService: AuthService,
    private readonly mapper: StorageMapper,
  ) {}

  // ── Unit types ─────────────────────────────────────────────────────────

  @Get('unit-types')
  @ApiOperation({ summary: 'List all storage unit types, including inactive' })
  @ApiOkResponse({ type: StorageUnitTypeListResponseDto })
  async findAllUnitTypes(@Query() query: QueryStorageActiveDto) {
    const unitTypes = await this.storageService.findAllUnitTypesAdmin(
      query.isActive,
    );
    return unitTypes.map((u) => this.mapper.toUnitTypeDto(u));
  }

  @Get('unit-types/:id')
  @ApiOperation({ summary: 'Get a single storage unit type' })
  @ApiOkResponse({ type: StorageUnitTypeResponseDto })
  async findUnitType(@Param('id', ParseUUIDPipe) id: string) {
    const unitType = await this.storageService.findUnitTypeOrFail(id);
    return this.mapper.toUnitTypeDto(unitType);
  }

  @Post('unit-types')
  @ApiOperation({ summary: 'Create a storage unit type' })
  @ApiOkResponse({ type: StorageUnitTypeResponseDto })
  async createUnitType(@Body() dto: CreateStorageUnitTypeDto) {
    const unitType = await this.storageService.createUnitType(dto);
    return this.mapper.toUnitTypeDto(unitType);
  }

  @Patch('unit-types/:id')
  @ApiOperation({ summary: 'Update a storage unit type' })
  @ApiOkResponse({ type: StorageUnitTypeResponseDto })
  async updateUnitType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStorageUnitTypeDto,
  ) {
    const unitType = await this.storageService.updateUnitType(id, dto);
    return this.mapper.toUnitTypeDto(unitType);
  }

  @Delete('unit-types/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a storage unit type' })
  async removeUnitType(@Param('id', ParseUUIDPipe) id: string) {
    await this.storageService.removeUnitType(id);
  }

  // ── Facilities ─────────────────────────────────────────────────────────

  @Get('facilities')
  @ApiOperation({ summary: 'List all storage facilities, including inactive' })
  @ApiOkResponse({ type: StorageFacilityListResponseDto })
  async findAllFacilities(@Query() query: QueryStorageActiveDto) {
    const facilities = await this.storageService.findAllFacilitiesAdmin(
      query.isActive,
    );
    return facilities.map((f) => this.mapper.toFacilityDto(f));
  }

  @Get('facilities/:id')
  @ApiOperation({ summary: 'Get a single storage facility' })
  @ApiOkResponse({ type: StorageFacilityResponseDto })
  async findFacility(@Param('id', ParseUUIDPipe) id: string) {
    const facility = await this.storageService.findFacilityOrFail(id);
    return this.mapper.toFacilityDto(facility);
  }

  @Post('facilities')
  @ApiOperation({ summary: 'Create a storage facility' })
  @ApiOkResponse({ type: StorageFacilityResponseDto })
  async createFacility(@Body() dto: CreateStorageFacilityDto) {
    const facility = await this.storageService.createFacility(dto);
    return this.mapper.toFacilityDto(facility);
  }

  @Patch('facilities/:id')
  @ApiOperation({ summary: 'Update a storage facility' })
  @ApiOkResponse({ type: StorageFacilityResponseDto })
  async updateFacility(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStorageFacilityDto,
  ) {
    const facility = await this.storageService.updateFacility(id, dto);
    return this.mapper.toFacilityDto(facility);
  }

  @Delete('facilities/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a storage facility' })
  async removeFacility(@Param('id', ParseUUIDPipe) id: string) {
    await this.storageService.removeFacility(id);
  }

  // ── Inventory ──────────────────────────────────────────────────────────

  @Get('inventory')
  @ApiOperation({
    summary:
      'List inventory rows (facility × unit type pools), optionally filtered',
  })
  @ApiOkResponse({ type: StorageInventoryListResponseDto })
  async findAllInventory(@Query() query: QueryStorageInventoryDto) {
    const rows = await this.storageService.findAllInventoryAdmin(
      query.facilityId,
      query.unitTypeId,
    );
    return rows.map((r) => this.mapper.toInventoryDto(r));
  }

  @Get('inventory/:id')
  @ApiOperation({ summary: 'Get a single inventory row' })
  @ApiOkResponse({ type: StorageInventoryResponseDto })
  async findInventory(@Param('id', ParseUUIDPipe) id: string) {
    const row = await this.storageService.findInventoryOrFail(id);
    return this.mapper.toInventoryDto(row);
  }

  @Post('inventory')
  @ApiOperation({
    summary:
      'Create an inventory row (sets total capacity for a facility × unit type pair)',
  })
  @ApiOkResponse({ type: StorageInventoryResponseDto })
  async createInventory(@Body() dto: CreateStorageInventoryDto) {
    const row = await this.storageService.createInventory(dto);
    return this.mapper.toInventoryDto(row);
  }

  @Patch('inventory/:id')
  @ApiOperation({ summary: 'Update an inventory row' })
  @ApiOkResponse({ type: StorageInventoryResponseDto })
  async updateInventory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStorageInventoryDto,
  ) {
    const row = await this.storageService.updateInventory(id, dto);
    return this.mapper.toInventoryDto(row);
  }

  @Delete('inventory/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an inventory row' })
  async removeInventory(@Param('id', ParseUUIDPipe) id: string) {
    await this.storageService.removeInventory(id);
  }

  // ── SSE stream ticket ──────────────────────────────────────────────────

  @Post('stream-ticket')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mint a 60s single-purpose ticket for the admin SSE stream — EventSource cannot send an Authorization header, so GET /admin/storage/stream authenticates via ?ticket= instead of Bearer',
  })
  @ApiOkResponse({ type: StorageStreamTicketResponseDto })
  issueStreamTicket(@CurrentUser() user: User) {
    return this.authService.issueStreamTicket(user);
  }
}

// ─── Admin stream controller ──────────────────────────────────────────────────
// Deliberately its own class, NOT part of StorageAdminController: that class
// carries a class-level @Roles(ADMIN), and @Public() on a single method
// inside it would still leave @Roles' metadata in effect — RolesGuard would
// then run before JwtStreamGuard, find requiredRoles = [ADMIN], and crash
// dereferencing request.user.role (JwtAuthGuard never ran to populate it,
// since @Public() skipped it). Isolating the route in its own controller
// with no @Roles at all sidesteps that entirely; JwtStreamStrategy already
// re-checks the ADMIN role itself (see jwt-stream.strategy.ts).

@ApiTags('admin / storage')
@Controller('admin/storage')
export class StorageAdminStreamController {
  constructor(private readonly availability: StorageAvailabilityService) {}

  @Public()
  @UseGuards(JwtStreamGuard)
  @SkipTransform()
  @Sse('stream')
  @ApiOperation({
    summary:
      'SSE stream of availability + booking events for the admin panel. Auth via short-lived ?ticket= (see POST /admin/storage/stream-ticket) — EventSource cannot send an Authorization header.',
  })
  stream(): Observable<MessageEvent> {
    return this.availability.adminStream();
  }
}
