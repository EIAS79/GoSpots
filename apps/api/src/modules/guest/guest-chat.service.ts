import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GuestChatSender, GuestChatStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { requireShopId } from '../../common/tenant';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { assertShopHasFeature } from '../../common/venue-entitlements';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  assertGuestTokenActive,
  GUEST_CHAT_TOKEN_TTL_MS,
  guestTokenLookupWhere,
  guestTokenPersistFields,
  guestTokenRevokeFields,
  issueGuestToken,
  verifyPresentedGuestToken,
} from '../../common/guest-token.util';
import {
  assertPrivacyConsentAccepted,
  recordConsent,
} from '../../common/gdpr-consent.util';

const PING_COOLDOWN_MS = 2 * 60 * 1000;
const MAX_BODY = 2000;

@Injectable()
export class GuestChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private assertStaffRead(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER' || actor.shopRole === 'MANAGER') return;
    const ok =
      hasPermission(actor.perms ?? '', PERMISSIONS.MESSAGING_READ) ||
      hasPermission(actor.perms ?? '', PERMISSIONS.SHOP_MANAGE) ||
      hasPermission(actor.perms ?? '', PERMISSIONS.NOTIFICATIONS_READ);
    if (!ok) {
      throw new ForbiddenException('Missing messaging permission.');
    }
  }

  private assertStaffWrite(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER' || actor.shopRole === 'MANAGER') return;
    const ok =
      hasPermission(actor.perms ?? '', PERMISSIONS.MESSAGING_WRITE) ||
      hasPermission(actor.perms ?? '', PERMISSIONS.SHOP_MANAGE);
    if (!ok) {
      throw new ForbiddenException('Missing messaging write permission.');
    }
  }

  private serializeMessage(m: {
    id: string;
    sender: GuestChatSender;
    staffUserId: string | null;
    body: string;
    createdAt: Date;
  }) {
    return {
      id: m.id,
      sender: m.sender,
      staffUserId: m.staffUserId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    };
  }

  private serializeChat(
    chat: {
      id: string;
      guestName: string;
      guestEmail: string | null;
      guestPhone: string | null;
      status: GuestChatStatus;
      staffJoinedAt: Date | null;
      staffUserId: string | null;
      lastGuestPingAt: Date | null;
      endedAt: Date | null;
      endedBy: GuestChatSender | null;
      createdAt: Date;
      updatedAt: Date;
      messages?: {
        id: string;
        sender: GuestChatSender;
        staffUserId: string | null;
        body: string;
        createdAt: Date;
      }[];
    },
    opts: {
      rawToken?: string;
      venueName?: string;
      venueSlug?: string;
    } = {},
  ) {
    return {
      id: chat.id,
      ...(opts.rawToken ? { guestToken: opts.rawToken } : {}),
      guestName: chat.guestName,
      guestEmail: chat.guestEmail,
      guestPhone: chat.guestPhone,
      status: chat.status,
      staffJoinedAt: chat.staffJoinedAt?.toISOString() ?? null,
      staffUserId: chat.staffUserId,
      lastGuestPingAt: chat.lastGuestPingAt?.toISOString() ?? null,
      endedAt: chat.endedAt?.toISOString() ?? null,
      endedBy: chat.endedBy,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
      messages: (chat.messages ?? []).map((m) => this.serializeMessage(m)),
      venueName: opts.venueName,
      venueSlug: opts.venueSlug,
      canGuestChat:
        chat.status === GuestChatStatus.WAITING ||
        chat.status === GuestChatStatus.OPEN ||
        chat.status === GuestChatStatus.PAUSED,
      canGuestPing:
        chat.status === GuestChatStatus.WAITING ||
        chat.status === GuestChatStatus.OPEN ||
        chat.status === GuestChatStatus.PAUSED,
    };
  }

  async assertShopHasMessaging(shopId: string) {
    await assertShopHasFeature(this.prisma, shopId, 'messaging');
  }

  async createFromPublic(
    slug: string,
    dto: {
      guestName: string;
      guestEmail?: string;
      guestPhone?: string;
      message?: string;
      privacyConsentAccepted?: boolean;
    },
  ) {
    assertPrivacyConsentAccepted(dto.privacyConsentAccepted);

    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, name: true, slug: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');
    await this.assertShopHasMessaging(shop.id);

    if (!dto.guestName.trim()) {
      throw new BadRequestException('Your name is required.');
    }

    const issued = issueGuestToken({ ttlMs: GUEST_CHAT_TOKEN_TTL_MS });
    const firstBody = dto.message?.trim();

    const chat = await this.prisma.guestChat.create({
      data: {
        shopId: shop.id,
        ...guestTokenPersistFields(issued),
        guestName: dto.guestName.trim(),
        guestEmail: dto.guestEmail?.trim() || null,
        guestPhone: dto.guestPhone?.trim() || null,
        status: GuestChatStatus.WAITING,
        messages: firstBody
          ? {
              create: {
                sender: GuestChatSender.GUEST,
                body: firstBody.slice(0, MAX_BODY),
              },
            }
          : undefined,
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    await this.audit.recordForShop(shop.id, {
      section: 'venue',
      action: 'guest_chat.create',
      summary: `${chat.guestName} started a support chat`,
      meta: { chatId: chat.id },
    });

    await recordConsent(this.prisma, {
      shopId: shop.id,
      purpose: 'GUEST_CHAT',
      guestEmail: chat.guestEmail,
      sourceEntityType: 'guestChat',
      sourceEntityId: chat.id,
    });

    await this.notifications.recordTeamEvent(shop.id, {
      title: 'Guest waiting to chat',
      body: `${chat.guestName} is waiting for staff on the venue page`,
      href: `/messages?chat=${chat.id}`,
      dedupeKey: `guest-chat-wait:${chat.id}`,
    });

    return {
      ok: true,
      message: 'Chat started. A staff member will join shortly.',
      guestToken: issued.raw,
      chat: this.serializeChat(chat, {
        rawToken: issued.raw,
        venueName: shop.name,
        venueSlug: shop.slug,
      }),
    };
  }

  private async findPublicChat(shopId: string, token: string) {
    const chat = await this.prisma.guestChat.findFirst({
      where: guestTokenLookupWhere(shopId, token),
    });
    if (!chat || !verifyPresentedGuestToken(chat, token)) {
      throw new NotFoundException('Chat not found.');
    }
    assertGuestTokenActive(chat);
    return chat;
  }

  async getPublicChat(slug: string, token: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, name: true, slug: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');
    await this.assertShopHasMessaging(shop.id);

    const chat = await this.prisma.guestChat.findFirst({
      where: guestTokenLookupWhere(shop.id, token),
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 200 } },
    });
    if (!chat || !verifyPresentedGuestToken(chat, token)) {
      throw new NotFoundException('Chat not found.');
    }
    assertGuestTokenActive(chat);

    return this.serializeChat(chat, {
      venueName: shop.name,
      venueSlug: shop.slug,
    });
  }

  async guestSendMessage(slug: string, token: string, body: string) {
    const text = body?.trim();
    if (!text) throw new BadRequestException('Message cannot be empty.');
    if (text.length > MAX_BODY) {
      throw new BadRequestException('Message is too long.');
    }

    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, name: true, slug: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');
    await this.assertShopHasMessaging(shop.id);

    const chat = await this.findPublicChat(shop.id, token);
    if (chat.status === GuestChatStatus.ENDED) {
      throw new BadRequestException('This chat has ended.');
    }

    const msg = await this.prisma.guestChatMessage.create({
      data: {
        chatId: chat.id,
        sender: GuestChatSender.GUEST,
        body: text,
      },
    });
    await this.prisma.guestChat.update({
      where: { id: chat.id, shopId: shop.id },
      data: { updatedAt: new Date() },
    });

    await this.notifications.recordTeamEvent(shop.id, {
      title: 'New guest chat message',
      body: `${chat.guestName}: ${text.slice(0, 80)}`,
      href: `/messages?chat=${chat.id}`,
      dedupeKey: `guest-chat-msg:${msg.id}`,
    });

    return this.serializeMessage(msg);
  }

  async guestPing(slug: string, token: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');
    await this.assertShopHasMessaging(shop.id);

    const chat = await this.findPublicChat(shop.id, token);
    if (chat.status === GuestChatStatus.ENDED) {
      throw new BadRequestException('This chat has ended.');
    }

    const now = Date.now();
    if (
      chat.lastGuestPingAt &&
      now - chat.lastGuestPingAt.getTime() < PING_COOLDOWN_MS
    ) {
      const waitSec = Math.ceil(
        (PING_COOLDOWN_MS - (now - chat.lastGuestPingAt.getTime())) / 1000,
      );
      throw new BadRequestException(
        `Please wait ${waitSec}s before notifying staff again.`,
      );
    }

    await this.prisma.guestChat.update({
      where: { id: chat.id, shopId: shop.id },
      data: { lastGuestPingAt: new Date() },
    });

    const reason =
      chat.status === GuestChatStatus.WAITING
        ? 'still waiting for someone to join'
        : chat.status === GuestChatStatus.PAUSED
          ? 'chat is paused — guest needs help'
          : 'guest is waiting for a reply';

    await this.notifications.recordTeamEvent(shop.id, {
      title: 'Guest needs attention',
      body: `${chat.guestName} · ${reason}`,
      href: `/messages?chat=${chat.id}`,
      dedupeKey: `guest-chat-ping:${chat.id}:${Math.floor(now / PING_COOLDOWN_MS)}`,
    });

    return { ok: true, message: 'Staff were notified.' };
  }

  async guestEnd(slug: string, token: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, name: true, slug: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');
    await this.assertShopHasMessaging(shop.id);

    const chat = await this.findPublicChat(shop.id, token);
    const withMessages = await this.prisma.guestChat.findFirst({
      where: { id: chat.id, shopId: shop.id },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 200 } },
    });
    if (!withMessages) throw new NotFoundException('Chat not found.');

    if (withMessages.status === GuestChatStatus.ENDED) {
      return this.serializeChat(withMessages, {
        venueName: shop.name,
        venueSlug: shop.slug,
      });
    }

    const updated = await this.prisma.guestChat.update({
      where: { id: chat.id, shopId: shop.id },
      data: {
        status: GuestChatStatus.ENDED,
        endedAt: new Date(),
        endedBy: GuestChatSender.GUEST,
        ...guestTokenRevokeFields(),
      },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 200 } },
    });

    await this.notifications.recordTeamEvent(shop.id, {
      title: 'Guest ended chat',
      body: `${chat.guestName} closed the support chat`,
      href: `/messages?chat=${chat.id}`,
      dedupeKey: `guest-chat-end:${chat.id}`,
    });

    return this.serializeChat(updated, {
      venueName: shop.name,
      venueSlug: shop.slug,
    });
  }

  async guestDelete(slug: string, token: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');
    await this.assertShopHasMessaging(shop.id);

    const chat = await this.findPublicChat(shop.id, token);

    await this.prisma.guestChat.delete({
      where: { id: chat.id, shopId: shop.id },
    });

    await this.audit.recordForShop(shop.id, {
      section: 'venue',
      action: 'guest_chat.delete_guest',
      summary: `${chat.guestName} deleted their support chat`,
      meta: { chatId: chat.id },
    });

    return { ok: true };
  }

  async listForShop(
    actor: JwtAccessPayload,
    opts: { status?: GuestChatStatus; take?: number; skip?: number } = {},
  ) {
    this.assertStaffRead(actor);
    const shopId = requireShopId(actor);
    await this.assertShopHasMessaging(shopId);
    const take = Math.min(Math.max(opts.take ?? 50, 1), 100);
    const skip = Math.max(opts.skip ?? 0, 0);

    const where = {
      shopId,
      ...(opts.status ? { status: opts.status } : {}),
    };

    const [
      items,
      total,
      statusGroups,
      notifiedCount,
      contactCount,
      attentionCount,
    ] = await Promise.all([
      this.prisma.guestChat.findMany({
        where,
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        take,
        skip,
        include: {
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.guestChat.count({ where }),
      this.prisma.guestChat.groupBy({
        by: ['status'],
        where: { shopId },
        _count: { _all: true },
      }),
      this.prisma.guestChat.count({
        where: {
          shopId,
          status: { not: GuestChatStatus.ENDED },
          lastGuestPingAt: { not: null },
        },
      }),
      this.prisma.contactMessage.count({ where: { shopId } }),
      this.prisma.guestChat.count({
        where: {
          shopId,
          status: { not: GuestChatStatus.ENDED },
          OR: [
            { status: GuestChatStatus.WAITING },
            { lastGuestPingAt: { not: null } },
          ],
        },
      }),
    ]);

    const byStatus: Record<GuestChatStatus, number> = {
      WAITING: 0,
      OPEN: 0,
      PAUSED: 0,
      ENDED: 0,
    };
    for (const row of statusGroups) {
      byStatus[row.status] = row._count._all;
    }
    const waitingCount = byStatus.WAITING;
    const allCount =
      byStatus.WAITING + byStatus.OPEN + byStatus.PAUSED + byStatus.ENDED;

    return {
      total,
      waitingCount,
      notifiedCount,
      attentionCount,
      contactCount,
      counts: {
        ALL: allCount,
        WAITING: byStatus.WAITING,
        OPEN: byStatus.OPEN,
        PAUSED: byStatus.PAUSED,
        ENDED: byStatus.ENDED,
        notified: notifiedCount,
      },
      items: items.map((c) => ({
        id: c.id,
        guestName: c.guestName,
        guestEmail: c.guestEmail,
        guestPhone: c.guestPhone,
        status: c.status,
        staffJoinedAt: c.staffJoinedAt?.toISOString() ?? null,
        lastGuestPingAt: c.lastGuestPingAt?.toISOString() ?? null,
        endedAt: c.endedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        lastMessage: c.messages[0]
          ? this.serializeMessage(c.messages[0])
          : null,
        messageCount: undefined as number | undefined,
      })),
    };
  }

  async badgeForShop(actor: JwtAccessPayload) {
    this.assertStaffRead(actor);
    const shopId = requireShopId(actor);
    try {
      await this.assertShopHasMessaging(shopId);
    } catch {
      return {
        waiting: 0,
        notified: 0,
        attention: 0,
        contact: 0,
        total: 0,
      };
    }

    const [waiting, notified, attention, contact] = await Promise.all([
      this.prisma.guestChat.count({
        where: { shopId, status: GuestChatStatus.WAITING },
      }),
      this.prisma.guestChat.count({
        where: {
          shopId,
          status: { not: GuestChatStatus.ENDED },
          lastGuestPingAt: { not: null },
        },
      }),
      this.prisma.guestChat.count({
        where: {
          shopId,
          status: { not: GuestChatStatus.ENDED },
          OR: [
            { status: GuestChatStatus.WAITING },
            { lastGuestPingAt: { not: null } },
          ],
        },
      }),
      this.prisma.contactMessage.count({ where: { shopId } }),
    ]);

    return {
      waiting,
      notified,
      attention,
      contact,
      total: attention + contact,
    };
  }

  async getForStaff(actor: JwtAccessPayload, id: string) {
    this.assertStaffRead(actor);
    const shopId = requireShopId(actor);
    await this.assertShopHasMessaging(shopId);
    const chat = await this.prisma.guestChat.findFirst({
      where: { id, shopId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 300 } },
    });
    if (!chat) throw new NotFoundException('Chat not found.');
    return this.serializeChat(chat);
  }

  async staffJoin(actor: JwtAccessPayload, id: string) {
    this.assertStaffWrite(actor);
    const shopId = requireShopId(actor);
    await this.assertShopHasMessaging(shopId);
    const chat = await this.prisma.guestChat.findFirst({
      where: { id, shopId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 300 } },
    });
    if (!chat) throw new NotFoundException('Chat not found.');
    if (chat.status === GuestChatStatus.ENDED) {
      throw new BadRequestException('Reopen the chat before joining.');
    }

    const updated = await this.prisma.guestChat.update({
      where: { id, shopId },
      data: {
        status: GuestChatStatus.OPEN,
        staffJoinedAt: chat.staffJoinedAt ?? new Date(),
        staffUserId: actor.sub,
        lastGuestPingAt: null,
      },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 300 } },
    });

    await this.audit.record(actor, {
      section: 'venue',
      action: 'guest_chat.join',
      summary: `Joined chat with ${chat.guestName}`,
      meta: { chatId: id },
    });

    return this.serializeChat(updated);
  }

  async staffSetStatus(
    actor: JwtAccessPayload,
    id: string,
    status: GuestChatStatus,
  ) {
    this.assertStaffWrite(actor);
    const shopId = requireShopId(actor);
    await this.assertShopHasMessaging(shopId);
    const chat = await this.prisma.guestChat.findFirst({
      where: { id, shopId },
    });
    if (!chat) throw new NotFoundException('Chat not found.');

    if (status === GuestChatStatus.WAITING) {
      throw new BadRequestException('Cannot set status back to waiting.');
    }

    const data: {
      status: GuestChatStatus;
      endedAt?: Date | null;
      endedBy?: GuestChatSender | null;
      staffJoinedAt?: Date | null;
      staffUserId?: string | null;
    } = { status };

    if (status === GuestChatStatus.ENDED) {
      data.endedAt = new Date();
      data.endedBy = GuestChatSender.STAFF;
      Object.assign(data, guestTokenRevokeFields());
    } else if (status === GuestChatStatus.OPEN) {
      data.endedAt = null;
      data.endedBy = null;
      data.staffJoinedAt = chat.staffJoinedAt ?? new Date();
      data.staffUserId = chat.staffUserId ?? actor.sub;
    } else if (status === GuestChatStatus.PAUSED) {
      if (chat.status === GuestChatStatus.ENDED) {
        throw new BadRequestException('Reopen the chat before pausing.');
      }
    }

    const updated = await this.prisma.guestChat.update({
      where: { id, shopId },
      data,
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 300 } },
    });

    await this.audit.record(actor, {
      section: 'venue',
      action: 'guest_chat.status',
      summary: `Set chat with ${chat.guestName} to ${status}`,
      meta: { chatId: id, status },
    });

    return this.serializeChat(updated);
  }

  async staffSendMessage(actor: JwtAccessPayload, id: string, body: string) {
    this.assertStaffWrite(actor);
    const text = body?.trim();
    if (!text) throw new BadRequestException('Message cannot be empty.');
    if (text.length > MAX_BODY) {
      throw new BadRequestException('Message is too long.');
    }

    const shopId = requireShopId(actor);
    await this.assertShopHasMessaging(shopId);
    const chat = await this.prisma.guestChat.findFirst({
      where: { id, shopId },
    });
    if (!chat) throw new NotFoundException('Chat not found.');
    if (chat.status === GuestChatStatus.ENDED) {
      throw new BadRequestException('Reopen the chat to send messages.');
    }
    if (chat.status === GuestChatStatus.WAITING) {
      await this.prisma.guestChat.update({
        where: { id, shopId },
        data: {
          status: GuestChatStatus.OPEN,
          staffJoinedAt: new Date(),
          staffUserId: actor.sub,
          lastGuestPingAt: null,
        },
      });
    }

    const msg = await this.prisma.guestChatMessage.create({
      data: {
        chatId: id,
        sender: GuestChatSender.STAFF,
        staffUserId: actor.sub,
        body: text,
      },
    });
    await this.prisma.guestChat.update({
      where: { id, shopId },
      data: { updatedAt: new Date(), lastGuestPingAt: null },
    });

    return this.serializeMessage(msg);
  }

  async staffDelete(actor: JwtAccessPayload, id: string) {
    this.assertStaffWrite(actor);
    const shopId = requireShopId(actor);
    await this.assertShopHasMessaging(shopId);
    const chat = await this.prisma.guestChat.findFirst({
      where: { id, shopId },
    });
    if (!chat) throw new NotFoundException('Chat not found.');

    await this.prisma.guestChat.delete({ where: { id, shopId } });

    await this.audit.record(actor, {
      section: 'venue',
      action: 'guest_chat.delete',
      summary: `Deleted chat with ${chat.guestName}`,
      meta: { chatId: id },
    });

    return { ok: true };
  }
}
