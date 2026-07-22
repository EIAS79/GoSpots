import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { requireShopId } from '../../common/tenant';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ShopRoles, SystemRoles } from '../auth/decorators/roles.decorator';
import type { JwtAccessPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MailOutboxService } from './mail-outbox.service';

/**
 * Owner API for mail outbox dead-letter visibility + manual retry.
 * SUPER_ADMIN: `system/dead` for null-shopId (platform) mail.
 * Dashboard: settings `MailOutboxPanel`. Bodies (html/text) never returned.
 */
@ApiTags('mail-outbox')
@Controller('mail/outbox')
@UseGuards(JwtAuthGuard)
export class MailOutboxController {
  constructor(private readonly outbox: MailOutboxService) {}

  private assertOwner(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException('No venue selected.');
    if (actor.shopRole !== 'OWNER') {
      throw new ForbiddenException(
        'Owner role required for mail outbox dead-letter access.',
      );
    }
  }

  private assertSuperAdmin(actor: JwtAccessPayload) {
    if (actor.sysRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Super admin required for system mail.');
    }
  }

  /**
   * Platform / auth mail with null shopId (password reset, new-device, etc.).
   * Must be registered before `:id` routes.
   */
  @Get('system/dead')
  @SystemRoles('SUPER_ADMIN')
  async listSystemDead(
    @CurrentUser() user: JwtAccessPayload,
    @Query('includeFailed') includeFailed?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    this.assertSuperAdmin(user);
    const include =
      includeFailed === '1' ||
      includeFailed === 'true' ||
      includeFailed === 'yes';

    const [counts, list] = await Promise.all([
      this.outbox.statusCounts(null, { systemOnly: true }),
      this.outbox.listDeadLetters({
        systemOnly: true,
        includeFailed: include,
        take: take ? +take : 50,
        skip: skip ? +skip : 0,
      }),
    ]);

    return {
      counts,
      total: list.total,
      items: list.items,
      meta: {
        note: 'System mail (shopId null) dead letters — no html/text. POST /mail/outbox/system/:id/retry requeues.',
        scope: 'system',
      },
    };
  }

  @Post('system/:id/retry')
  @SystemRoles('SUPER_ADMIN')
  async retrySystem(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    this.assertSuperAdmin(user);
    const item = await this.outbox.requeueDeadLetter(id, { systemOnly: true });
    return {
      item,
      meta: {
        note: 'System mail row reset to PENDING with attempts=0; cron will pick it up.',
        scope: 'system',
      },
    };
  }

  /** Status counts + DEAD rows for the active venue (optional FAILED). */
  @Get('dead')
  @ShopRoles('OWNER')
  async listDead(
    @CurrentUser() user: JwtAccessPayload,
    @Query('includeFailed') includeFailed?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    this.assertOwner(user);
    const shopId = requireShopId(user);
    const include =
      includeFailed === '1' ||
      includeFailed === 'true' ||
      includeFailed === 'yes';

    const [counts, list] = await Promise.all([
      this.outbox.statusCounts(shopId),
      this.outbox.listDeadLetters({
        shopId,
        includeFailed: include,
        take: take ? +take : 50,
        skip: skip ? +skip : 0,
      }),
    ]);

    return {
      counts,
      total: list.total,
      items: list.items,
      meta: {
        note: 'Dead-letter list stub — no html/text bodies. POST /mail/outbox/:id/retry requeues DEAD → PENDING.',
      },
    };
  }

  /** Requeue one DEAD row for the active venue (fresh attempt budget). */
  @Post(':id/retry')
  @ShopRoles('OWNER')
  async retry(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    this.assertOwner(user);
    const shopId = requireShopId(user);
    const item = await this.outbox.requeueDeadLetter(id, { shopId });
    return {
      item,
      meta: {
        note: 'Row reset to PENDING with attempts=0; cron worker will pick it up on the next tick.',
      },
    };
  }
}
