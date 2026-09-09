import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { Public } from '../../common/decorators/public.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessModule } from '../../common/enums/access-module.enum';
import { User } from '../users/entities/user.entity';
import { AuthService } from '../auth/auth.service';
import { JwtNotificationsStreamGuard } from '../auth/guards/jwt-stream.guard';
import { NotificationsService } from './notifications.service';
import { NotificationsMapper } from './notifications.mapper';
import { QueryAdminNotificationsDto } from './dto/query-admin-notifications.dto';
import {
  NotificationListResponseDto,
  NotificationSummaryResponseDto,
  NotificationStreamTicketResponseDto,
} from './dto/notification-response.dto';

// ─── Admin controller ─────────────────────────────────────────────────────────

@ApiTags('admin / notifications')
@ApiBearerAuth()
@RequireModule(AccessModule.NOTIFICATIONS)
@Controller('admin/notifications')
export class NotificationsAdminController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly mapper: NotificationsMapper,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List booking notifications across Moving/Storage/Event Support (paginated; filter by sourceModule and unresolved/all)',
  })
  @ApiOkResponse({ type: NotificationListResponseDto })
  async findAll(@Query() query: QueryAdminNotificationsDto) {
    const { data, meta } = await this.notificationsService.findAllAdmin(query);
    return { data: data.map((n) => this.mapper.toDto(n)), meta };
  }

  @Get('summary')
  @ApiOperation({
    summary:
      'Badge counts for the bell: unresolvedCount (still pending -- never decremented by reading) and unreadCount',
  })
  @ApiOkResponse({ type: NotificationSummaryResponseDto })
  async summary() {
    return this.notificationsService.getSummary();
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Mark one notification read -- does not resolve it',
  })
  async markRead(@Param('id', ParseUUIDPipe) id: string) {
    await this.notificationsService.markRead(id);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Mark every unread notification read -- does not resolve any of them; unresolvedCount is unaffected',
  })
  async markAllRead() {
    await this.notificationsService.markAllRead();
  }

  @Post('stream-ticket')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mint a 60s single-purpose ticket for the admin SSE stream -- EventSource cannot send an Authorization header, so GET /admin/notifications/stream authenticates via ?ticket= instead of Bearer',
  })
  @ApiOkResponse({ type: NotificationStreamTicketResponseDto })
  issueStreamTicket(@CurrentUser() user: User) {
    return this.authService.issueStreamTicket(user, AccessModule.NOTIFICATIONS);
  }
}

// ─── Admin stream controller ──────────────────────────────────────────────────
// Deliberately its own class, NOT part of NotificationsAdminController: that
// class carries a class-level @RequireModule(NOTIFICATIONS), and RolesGuard
// runs globally regardless (@Public() only skips JwtAuthGuard, so it would
// still see that metadata). Isolating this route means RolesGuard has
// nothing to check here at all -- the module grant is instead re-verified
// live inside JwtNotificationsStreamStrategy.validate() (see
// jwt-stream.strategy.ts), because that's also where the ticket's `module`
// claim gets checked against this stream's fixed module, and a route-level
// @RequireModule can't express "only if the ticket says so". Same pattern
// as StorageAdminStreamController.

@ApiTags('admin / notifications')
@Controller('admin/notifications')
export class NotificationsAdminStreamController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Public()
  @UseGuards(JwtNotificationsStreamGuard)
  @SkipTransform()
  @Sse('stream')
  @ApiOperation({
    summary:
      'SSE stream of notification.snapshot (fired immediately on every connect) / notification.created / notification.resolved / notification.read events for the admin panel. Auth via short-lived ?ticket= (see POST /admin/notifications/stream-ticket) -- EventSource cannot send an Authorization header.',
  })
  stream(): Observable<MessageEvent> {
    return this.notificationsService.stream();
  }
}
