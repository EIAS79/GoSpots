import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import type { JwtAccessPayload } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreatePublicContactDto } from './dto/guest.dto';

@Injectable()
export class ContactMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private assertRead(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER' || actor.shopRole === 'MANAGER') return;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.SHOP_MANAGE)) return;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.NOTIFICATIONS_READ)) {
      return;
    }
    throw new ForbiddenException(
      'Missing shop.manage or notifications.read permission.',
    );
  }

  async listForShop(
    actor: JwtAccessPayload,
    opts: { take?: number; skip?: number } = {},
  ) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    const take = Math.min(opts.take ?? 50, 200);
    const skip = opts.skip ?? 0;

    const [items, total] = await Promise.all([
      this.prisma.contactMessage.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.contactMessage.count({ where: { shopId } }),
    ]);

    return { items, total, take, skip };
  }

  async createFromPublic(slug: string, dto: CreatePublicContactDto) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, name: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');

    if (!dto.guestEmail?.trim() && !dto.guestPhone?.trim()) {
      throw new BadRequestException(
        'Provide an email or phone number so the venue can reply.',
      );
    }

    const row = await this.prisma.contactMessage.create({
      data: {
        shopId: shop.id,
        guestName: dto.guestName.trim(),
        guestEmail: dto.guestEmail?.trim() || null,
        guestPhone: dto.guestPhone?.trim() || null,
        subject: dto.subject?.trim() || null,
        message: dto.message.trim(),
      },
    });

    await this.audit.recordForShop(shop.id, {
      section: 'venue',
      action: 'contact.create_public',
      summary: `Guest message from ${row.guestName}`,
      meta: {
        messageId: row.id,
        guestName: row.guestName,
        subject: row.subject,
      },
    });

    await this.notifications.recordOperationsEvent(shop.id, {
      title: 'New guest message',
      body: `${row.guestName}${row.subject ? ` · ${row.subject}` : ''}`,
      href: '/messages',
      dedupeKey: `contact:${row.id}`,
    });

    return {
      ok: true,
      message: 'Your message was sent. The venue will get back to you soon.',
      id: row.id,
    };
  }
}
