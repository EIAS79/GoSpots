import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  assertPrivacyConsentAccepted,
  GDPR_CONSENT_POLICY_VERSION,
  hashConsentEmail,
  recordConsent,
} from '../../common/gdpr-consent.util';
import { hashPassword } from '../../common/security/password';
import {
  assertUserPassword,
  requireConfirmPassword,
} from '../../common/security/verify-password.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ERASE_ACCOUNT_CONFIRM_PHRASE,
  type CloseGuestDsarDto,
  type EraseAccountDto,
  type EraseGuestByEmailDto,
  type EraseGuestDto,
  type GdprEraseEntityType,
  type GuestDsarDto,
} from './dto/gdpr.dto';

/** Non-null string columns cannot be SQL-null; use a stable placeholder. */
const REDACTED = '[redacted]';

const ACCOUNTING_LIMITATIONS = [
  'Money rows (orders, play billing, billedAmount, finance transactions) are retained for accounting — amounts and ids are not deleted.',
  'Lemon Squeezy / Resend processor copies are not auto-purged — OPERATOR cancels Lemon + documents DPA purge.',
] as const;

const ERASE_LIMITATIONS = [
  'Shop-scoped guest PII redaction only (current venue from session shopId).',
  'Not a cross-shop merge; other venues with the same guest email are untouched unless you erase there too.',
  ...ACCOUNTING_LIMITATIONS,
  'Guest tokens are revoked/cleared so status links stop working; row ids and booking/event/chat structure remain.',
] as const;

const ACCOUNT_ERASE_LIMITATIONS = [
  'Revokes all refresh sessions and deactivates memberships for this user.',
  'Owned venues are unpublished; shop + guest PII redacted; money/subscription rows kept for accounting.',
  'User row is soft-wiped (email tombstoned); not a hard DELETE (ownerId FKs + ledger history).',
  ...ACCOUNTING_LIMITATIONS,
] as const;

/**
 * Shop-scoped personal-data export, guest erase, account wipe, retention helpers,
 * consent recording (via util), and guest DSAR inbox.
 */
@Injectable()
export class GdprService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  private assertOwner(
    actor: JwtAccessPayload,
    action: 'export' | 'erase' | 'dsar',
  ) {
    if (!actor.shopId) throw new ForbiddenException('No venue selected.');
    if (actor.shopRole !== 'OWNER') {
      throw new ForbiddenException(
        action === 'export'
          ? 'Owner role required for GDPR export.'
          : action === 'dsar'
            ? 'Owner role required to manage DSAR requests.'
            : 'Owner role required for GDPR erase.',
      );
    }
  }

  private tokenRevoke() {
    return {
      guestToken: null,
      guestTokenHash: null,
      guestTokenExpiresAt: null,
      guestTokenRevokedAt: new Date(),
    };
  }

  async exportShopPersonalData(actor: JwtAccessPayload) {
    this.assertOwner(actor, 'export');
    const shopId = requireShopId(actor);

    const [
      shop,
      memberships,
      reservations,
      eventRequests,
      contactMessages,
      guestChats,
      venueReviews,
      consentRecords,
      dsarRequests,
      auditLogs,
      authSessions,
      financeSummary,
    ] = await Promise.all([
      this.prisma.shop.findFirst({
        where: { id: shopId },
        select: {
          id: true,
          slug: true,
          name: true,
          displayName: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          country: true,
          ownerId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.membership.findMany({
        where: { shopId },
        select: {
          id: true,
          role: true,
          isActive: true,
          invitedBy: true,
          acceptedAt: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              accountType: true,
              staffHandle: true,
              emailVerified: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: { shopId },
        select: {
          id: true,
          guestName: true,
          guestEmail: true,
          guestPhone: true,
          partySize: true,
          startsAt: true,
          endsAt: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { startsAt: 'desc' },
      }),
      this.prisma.eventRequest.findMany({
        where: { shopId },
        select: {
          id: true,
          eventType: true,
          guestName: true,
          guestEmail: true,
          guestPhone: true,
          partySize: true,
          preferredStartsAt: true,
          preferredEndsAt: true,
          message: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contactMessage.findMany({
        where: { shopId },
        select: {
          id: true,
          guestName: true,
          guestEmail: true,
          guestPhone: true,
          subject: true,
          message: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.guestChat.findMany({
        where: { shopId },
        select: {
          id: true,
          guestName: true,
          guestEmail: true,
          guestPhone: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          endedAt: true,
          messages: {
            select: {
              id: true,
              sender: true,
              body: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.venueReview.findMany({
        where: { shopId },
        select: {
          id: true,
          guestName: true,
          guestEmail: true,
          rating: true,
          comment: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.consentRecord.findMany({
        where: { shopId },
        select: {
          id: true,
          purpose: true,
          policyVersion: true,
          subjectEmailHash: true,
          sourceEntityType: true,
          sourceEntityId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
      this.prisma.guestDsarRequest.findMany({
        where: { shopId },
        select: {
          id: true,
          type: true,
          status: true,
          guestEmail: true,
          guestName: true,
          message: true,
          createdAt: true,
          closedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.auditLog.findMany({
        where: { shopId },
        select: {
          id: true,
          section: true,
          action: true,
          summary: true,
          actorRole: true,
          actorName: true,
          actorEmail: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
      this.prisma.authSession.findMany({
        where: {
          user: { memberships: { some: { shopId } } },
        },
        select: {
          id: true,
          userId: true,
          userAgent: true,
          ipAddress: true,
          expiresAt: true,
          revokedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.financeSummaryForExport(shopId),
    ]);

    return {
      meta: {
        exportedAt: new Date().toISOString(),
        shopId,
        requestedByUserId: actor.sub,
        scope: 'shop',
        consentPolicyVersion: GDPR_CONSENT_POLICY_VERSION,
        limitations: [
          'Read-only data package for the current venue (shopId from session).',
          'Guest erase / account wipe / DSAR are separate mutations under /gdpr and /public/.../gdpr/dsar.',
          'Secrets omitted: password hashes, invite/reset tokens, guest tokens / hashes, session token hashes.',
          'Finance block is aggregate counts/sums only — no card data; amounts retained under accounting policy.',
          'Does not include other shops owned by the same account or Lemon/Resend processor copies.',
        ],
      },
      shop: shop
        ? {
            ...shop,
            createdAt: shop.createdAt.toISOString(),
            updatedAt: shop.updatedAt.toISOString(),
          }
        : null,
      memberships: memberships.map((m) => ({
        id: m.id,
        role: m.role,
        isActive: m.isActive,
        invitedBy: m.invitedBy,
        acceptedAt: m.acceptedAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
        user: {
          id: m.user.id,
          email: m.user.email,
          name: m.user.name,
          accountType: m.user.accountType,
          staffHandle: m.user.staffHandle,
          emailVerified: m.user.emailVerified,
          createdAt: m.user.createdAt.toISOString(),
          updatedAt: m.user.updatedAt.toISOString(),
        },
      })),
      reservations: reservations.map((r) => ({
        id: r.id,
        guestName: r.guestName,
        guestEmail: r.guestEmail,
        guestPhone: r.guestPhone,
        partySize: r.partySize,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
        status: r.status,
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      eventRequests: eventRequests.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        guestName: e.guestName,
        guestEmail: e.guestEmail,
        guestPhone: e.guestPhone,
        partySize: e.partySize,
        preferredStartsAt: e.preferredStartsAt.toISOString(),
        preferredEndsAt: e.preferredEndsAt?.toISOString() ?? null,
        message: e.message,
        status: e.status,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      contactMessages: contactMessages.map((c) => ({
        id: c.id,
        guestName: c.guestName,
        guestEmail: c.guestEmail,
        guestPhone: c.guestPhone,
        subject: c.subject,
        message: c.message,
        createdAt: c.createdAt.toISOString(),
      })),
      guestChats: guestChats.map((g) => ({
        id: g.id,
        guestName: g.guestName,
        guestEmail: g.guestEmail,
        guestPhone: g.guestPhone,
        status: g.status,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
        endedAt: g.endedAt?.toISOString() ?? null,
        messages: g.messages.map((msg) => ({
          id: msg.id,
          sender: msg.sender,
          body: msg.body,
          createdAt: msg.createdAt.toISOString(),
        })),
      })),
      venueReviews: venueReviews.map((v) => ({
        id: v.id,
        guestName: v.guestName,
        guestEmail: v.guestEmail,
        rating: v.rating,
        comment: v.comment,
        status: v.status,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      })),
      consentRecords: consentRecords.map((c) => ({
        id: c.id,
        purpose: c.purpose,
        policyVersion: c.policyVersion,
        subjectEmailHash: c.subjectEmailHash,
        sourceEntityType: c.sourceEntityType,
        sourceEntityId: c.sourceEntityId,
        createdAt: c.createdAt.toISOString(),
      })),
      guestDsarRequests: dsarRequests.map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        guestEmail: d.guestEmail,
        guestName: d.guestName,
        message: d.message,
        createdAt: d.createdAt.toISOString(),
        closedAt: d.closedAt?.toISOString() ?? null,
      })),
      auditLogs: auditLogs.map((a) => ({
        id: a.id,
        section: a.section,
        action: a.action,
        summary: a.summary,
        actorRole: a.actorRole,
        actorName: a.actorName,
        actorEmail: a.actorEmail,
        createdAt: a.createdAt.toISOString(),
      })),
      authSessions: authSessions.map((s) => ({
        id: s.id,
        userId: s.userId,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        expiresAt: s.expiresAt.toISOString(),
        revokedAt: s.revokedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
      financeSummary,
    };
  }

  private async financeSummaryForExport(shopId: string) {
    const [txCount, orderCount, lossCount, playCount] = await Promise.all([
      this.prisma.transaction.count({ where: { shopId } }),
      this.prisma.shopOrder.count({ where: { shopId } }),
      this.prisma.shopLoss.count({ where: { shopId } }),
      this.prisma.playSession.count({ where: { shopId } }),
    ]);
    return {
      transactionCount: txCount,
      shopOrderCount: orderCount,
      shopLossCount: lossCount,
      playSessionCount: playCount,
      note: 'Aggregate counts only; line items and card data omitted. Amounts retained in DB for accounting.',
    };
  }

  /**
   * Redact guest PII on one entity in this shop.
   * Keeps row ids and billing amounts; does not delete money/order rows.
   */
  async eraseGuest(
    actor: JwtAccessPayload,
    dto: EraseGuestDto,
    confirmPasswordHeader?: string,
  ) {
    this.assertOwner(actor, 'erase');
    const shopId = requireShopId(actor);

    const password = requireConfirmPassword(
      dto.password,
      confirmPasswordHeader,
    );
    await assertUserPassword(this.prisma, actor.sub, password);

    const entityType = dto.entityType as GdprEraseEntityType;
    const entityId = dto.entityId?.trim();
    if (!entityId) {
      throw new BadRequestException('entityId is required.');
    }

    const redactedFields = await this.redactGuestEntity(
      shopId,
      entityType,
      entityId,
    );

    await this.audit.record(actor, {
      section: 'system',
      action: 'gdpr.erase_guest',
      summary: `Redacted guest PII on ${entityType} ${entityId}`,
      meta: {
        entityType,
        entityId,
        redactedFields,
        shopId,
      },
    });

    return {
      ok: true as const,
      shopId,
      entityType,
      entityId,
      redactedFields,
      placeholder: REDACTED,
      meta: {
        erasedAt: new Date().toISOString(),
        requestedByUserId: actor.sub,
        limitations: [...ERASE_LIMITATIONS],
      },
    };
  }

  /** Batch-redact all guest entities in this shop matching an email. */
  async eraseGuestByEmail(
    actor: JwtAccessPayload,
    dto: EraseGuestByEmailDto,
    confirmPasswordHeader?: string,
  ) {
    this.assertOwner(actor, 'erase');
    const shopId = requireShopId(actor);
    const password = requireConfirmPassword(
      dto.password,
      confirmPasswordHeader,
    );
    await assertUserPassword(this.prisma, actor.sub, password);

    const email = dto.guestEmail.trim().toLowerCase();
    if (!email) throw new BadRequestException('guestEmail is required.');

    const counts = await this.redactGuestEmailInShop(shopId, email);

    await this.audit.record(actor, {
      section: 'system',
      action: 'gdpr.erase_guest_email',
      summary: `Redacted guest PII for email hash in shop`,
      meta: {
        shopId,
        emailHash: hashConsentEmail(email),
        counts,
      },
    });

    return {
      ok: true as const,
      shopId,
      counts,
      meta: {
        erasedAt: new Date().toISOString(),
        requestedByUserId: actor.sub,
        limitations: [...ERASE_LIMITATIONS],
      },
    };
  }

  /**
   * Soft account wipe for the signed-in user (password + confirm phrase).
   * Money / Lemon rows kept — OPERATOR processor gate.
   */
  async eraseAccount(actor: JwtAccessPayload, dto: EraseAccountDto) {
    if (dto.confirmPhrase !== ERASE_ACCOUNT_CONFIRM_PHRASE) {
      throw new BadRequestException(
        `confirmPhrase must be exactly "${ERASE_ACCOUNT_CONFIRM_PHRASE}".`,
      );
    }
    await assertUserPassword(this.prisma, actor.sub, dto.password);

    const userId = actor.sub;
    const ownedShops = await this.prisma.shop.findMany({
      where: { ownerId: userId },
      select: { id: true, slug: true },
    });

    const shopWipeCounts: Array<{ shopId: string; counts: Record<string, number> }> =
      [];

    for (const shop of ownedShops) {
      const counts = await this.redactAllGuestPiiInShop(shop.id);
      await this.prisma.shop.update({
        where: { id: shop.id },
        data: {
          isPublished: false,
          advertiseOnVenuesPage: false,
          email: null,
          phone: null,
          address: null,
          name: REDACTED,
          displayName: REDACTED,
          description: null,
        },
      });
      shopWipeCounts.push({ shopId: shop.id, counts });
    }

    await this.prisma.membership.updateMany({
      where: { userId },
      data: {
        isActive: false,
        inviteTokenHash: null,
        inviteExpiresAt: null,
        passwordResetRequestedAt: null,
      },
    });

    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Clear owner TOTP MFA + recovery codes (bible #18 columns) so RTBF
    // cannot leave authenticators/secrets bound to a wiped account.
    await this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } });

    const tombstoneEmail = `deleted+${userId}@redacted.local`;
    const unusableHash = await hashPassword(
      `wiped-${randomBytes(24).toString('base64url')}`,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: tombstoneEmail,
        name: null,
        staffHandle: null,
        emailVerified: false,
        passwordHash: unusableHash,
        passwordSetAt: null,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        failedLogins: 0,
        lockedUntil: null,
        totpEnabled: false,
        totpSecretEnc: null,
        totpVerifiedAt: null,
      },
    });

    const auditShopId = actor.shopId ?? ownedShops[0]?.id;
    if (auditShopId) {
      await this.audit.recordForShop(auditShopId, {
        section: 'system',
        action: 'gdpr.erase_account',
        summary: `Account wipe for user ${userId}`,
        meta: {
          userId,
          ownedShopIds: ownedShops.map((s) => s.id),
          shopWipeCounts,
        },
      });
    } else {
      await this.prisma.auditLog.create({
        data: {
          shopId: null,
          userId,
          section: 'system',
          action: 'gdpr.erase_account',
          summary: `Account wipe for user ${userId}`,
          meta: JSON.stringify({
            userId,
            ownedShopIds: [],
            shopWipeCounts,
          }),
          actorName: 'system',
        },
      });
    }

    return {
      ok: true as const,
      userId,
      ownedShopsRedacted: ownedShops.length,
      shopWipeCounts,
      meta: {
        erasedAt: new Date().toISOString(),
        limitations: [...ACCOUNT_ERASE_LIMITATIONS],
      },
    };
  }

  async listGuestDsar(actor: JwtAccessPayload) {
    this.assertOwner(actor, 'dsar');
    const shopId = requireShopId(actor);
    const items = await this.prisma.guestDsarRequest.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return {
      items: items.map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        guestEmail: d.guestEmail,
        guestName: d.guestName,
        message: d.message,
        createdAt: d.createdAt.toISOString(),
        closedAt: d.closedAt?.toISOString() ?? null,
      })),
    };
  }

  async closeGuestDsar(
    actor: JwtAccessPayload,
    id: string,
    dto: CloseGuestDsarDto,
    confirmPasswordHeader?: string,
  ) {
    this.assertOwner(actor, 'dsar');
    const shopId = requireShopId(actor);
    const password = requireConfirmPassword(
      dto.password,
      confirmPasswordHeader,
    );
    await assertUserPassword(this.prisma, actor.sub, password);

    const existing = await this.prisma.guestDsarRequest.findFirst({
      where: { id, shopId },
    });
    if (!existing) throw new NotFoundException('DSAR request not found.');

    const row = await this.prisma.guestDsarRequest.update({
      where: { id: existing.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    await this.audit.record(actor, {
      section: 'system',
      action: 'gdpr.dsar_close',
      summary: `Closed guest DSAR ${row.id}`,
      meta: { dsarId: row.id, type: row.type, shopId },
    });

    return {
      ok: true as const,
      id: row.id,
      status: row.status,
    };
  }

  /** Public guest self-serve DSAR for a published venue. */
  async submitGuestDsar(
    slug: string,
    dto: GuestDsarDto,
    ipAddress?: string,
  ) {
    assertPrivacyConsentAccepted(dto.privacyConsentAccepted);

    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: {
        id: true,
        name: true,
        displayName: true,
        email: true,
        slug: true,
      },
    });
    if (!shop) throw new NotFoundException('Venue not found.');

    const email = dto.guestEmail.trim().toLowerCase();
    const row = await this.prisma.guestDsarRequest.create({
      data: {
        shopId: shop.id,
        type: dto.type,
        guestEmail: email,
        guestName: dto.guestName?.trim() || null,
        message: dto.message?.trim() || null,
      },
    });

    await recordConsent(this.prisma, {
      shopId: shop.id,
      purpose: 'CONTACT',
      guestEmail: email,
      sourceEntityType: 'guestDsarRequest',
      sourceEntityId: row.id,
      ipAddress,
    });

    const venueLabel = shop.displayName?.trim() || shop.name;
    await this.notifications.recordOperationsEvent(shop.id, {
      title:
        dto.type === 'ACCESS'
          ? 'Guest data access request'
          : 'Guest erasure request',
      body: `${dto.guestName?.trim() || email} · ${email}`,
      href: '/settings',
      dedupeKey: `gdpr-dsar:${row.id}`,
    });

    const ownerInbox = shop.email?.trim();
    if (ownerInbox) {
      const subject =
        dto.type === 'ACCESS'
          ? `[GoSpots] Guest data access request — ${venueLabel}`
          : `[GoSpots] Guest erasure request — ${venueLabel}`;
      const text = [
        `A guest submitted a ${dto.type} request for ${venueLabel}.`,
        `Email: ${email}`,
        dto.guestName ? `Name: ${dto.guestName.trim()}` : null,
        dto.message ? `Message: ${dto.message.trim()}` : null,
        `Request id: ${row.id}`,
        `Open Shop settings → Privacy & data to review and close.`,
      ]
        .filter(Boolean)
        .join('\n');
      try {
        await this.mail.send({
          to: ownerInbox,
          subject,
          text,
          html: `<pre>${text.replace(/</g, '&lt;')}</pre>`,
          shopId: shop.id,
          idempotencyKey: `gdpr-dsar-mail:${row.id}`,
          required: false,
        });
      } catch {
        // Fail-open: ticket + in-app notification already persisted.
      }
    }

    await this.audit.recordForShop(shop.id, {
      section: 'system',
      action: 'gdpr.dsar_submit',
      summary: `Guest DSAR ${dto.type} from ${email}`,
      meta: {
        dsarId: row.id,
        type: dto.type,
        emailHash: hashConsentEmail(email),
      },
    });

    return {
      ok: true as const,
      id: row.id,
      message:
        'Your request was sent to the venue. They will follow up using the email you provided.',
    };
  }

  // ─── Redaction helpers (also used by retention cron) ───────────────

  async redactGuestEntity(
    shopId: string,
    entityType: GdprEraseEntityType,
    entityId: string,
  ): Promise<string[]> {
    const tokenRevoke = this.tokenRevoke();

    if (entityType === 'reservation') {
      const existing = await this.prisma.reservation.findFirst({
        where: { id: entityId, shopId },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException('Reservation not found in this venue.');
      }
      await this.prisma.reservation.update({
        where: { id: existing.id },
        data: {
          guestName: REDACTED,
          guestEmail: null,
          guestPhone: null,
          notes: null,
          ...tokenRevoke,
        },
      });
      return [
        'guestName',
        'guestEmail',
        'guestPhone',
        'notes',
        'guestToken',
        'guestTokenHash',
      ];
    }

    if (entityType === 'eventRequest') {
      const existing = await this.prisma.eventRequest.findFirst({
        where: { id: entityId, shopId },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException('Event request not found in this venue.');
      }
      await this.prisma.eventRequest.update({
        where: { id: existing.id },
        data: {
          guestName: REDACTED,
          guestEmail: null,
          guestPhone: null,
          message: null,
          ...tokenRevoke,
        },
      });
      return [
        'guestName',
        'guestEmail',
        'guestPhone',
        'message',
        'guestToken',
        'guestTokenHash',
      ];
    }

    if (entityType === 'guestChat') {
      const existing = await this.prisma.guestChat.findFirst({
        where: { id: entityId, shopId },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException('Guest chat not found in this venue.');
      }
      await this.prisma.$transaction([
        this.prisma.guestChat.update({
          where: { id: existing.id },
          data: {
            guestName: REDACTED,
            guestEmail: null,
            guestPhone: null,
            ...tokenRevoke,
          },
        }),
        this.prisma.guestChatMessage.updateMany({
          where: { chatId: existing.id },
          data: { body: REDACTED },
        }),
      ]);
      return [
        'guestName',
        'guestEmail',
        'guestPhone',
        'messages.body',
        'guestToken',
        'guestTokenHash',
      ];
    }

    if (entityType === 'contactMessage') {
      const existing = await this.prisma.contactMessage.findFirst({
        where: { id: entityId, shopId },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException('Contact message not found in this venue.');
      }
      await this.prisma.contactMessage.update({
        where: { id: existing.id },
        data: {
          guestName: REDACTED,
          guestEmail: null,
          guestPhone: null,
          subject: null,
          message: REDACTED,
        },
      });
      return ['guestName', 'guestEmail', 'guestPhone', 'subject', 'message'];
    }

    if (entityType === 'venueReview') {
      const existing = await this.prisma.venueReview.findFirst({
        where: { id: entityId, shopId },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException('Venue review not found in this venue.');
      }
      await this.prisma.venueReview.update({
        where: { id: existing.id },
        data: {
          guestName: REDACTED,
          guestEmail: null,
          comment: null,
        },
      });
      return ['guestName', 'guestEmail', 'comment'];
    }

    throw new BadRequestException('Unsupported entityType.');
  }

  async redactGuestEmailInShop(shopId: string, email: string) {
    const whereEmail = { shopId, guestEmail: email };
    const tokenRevoke = this.tokenRevoke();

    const reservations = await this.prisma.reservation.findMany({
      where: whereEmail,
      select: { id: true },
    });
    for (const r of reservations) {
      await this.prisma.reservation.update({
        where: { id: r.id },
        data: {
          guestName: REDACTED,
          guestEmail: null,
          guestPhone: null,
          notes: null,
          ...tokenRevoke,
        },
      });
    }

    const events = await this.prisma.eventRequest.findMany({
      where: whereEmail,
      select: { id: true },
    });
    for (const e of events) {
      await this.prisma.eventRequest.update({
        where: { id: e.id },
        data: {
          guestName: REDACTED,
          guestEmail: null,
          guestPhone: null,
          message: null,
          ...tokenRevoke,
        },
      });
    }

    const chats = await this.prisma.guestChat.findMany({
      where: whereEmail,
      select: { id: true },
    });
    for (const c of chats) {
      await this.prisma.$transaction([
        this.prisma.guestChat.update({
          where: { id: c.id },
          data: {
            guestName: REDACTED,
            guestEmail: null,
            guestPhone: null,
            ...tokenRevoke,
          },
        }),
        this.prisma.guestChatMessage.updateMany({
          where: { chatId: c.id },
          data: { body: REDACTED },
        }),
      ]);
    }

    const contacts = await this.prisma.contactMessage.updateMany({
      where: whereEmail,
      data: {
        guestName: REDACTED,
        guestEmail: null,
        guestPhone: null,
        subject: null,
        message: REDACTED,
      },
    });

    const reviews = await this.prisma.venueReview.updateMany({
      where: whereEmail,
      data: {
        guestName: REDACTED,
        guestEmail: null,
        comment: null,
      },
    });

    return {
      reservations: reservations.length,
      eventRequests: events.length,
      guestChats: chats.length,
      contactMessages: contacts.count,
      venueReviews: reviews.count,
    };
  }

  async redactAllGuestPiiInShop(shopId: string) {
    const tokenRevoke = this.tokenRevoke();

    const reservations = await this.prisma.reservation.updateMany({
      where: {
        shopId,
        NOT: { guestName: REDACTED },
      },
      data: {
        guestName: REDACTED,
        guestEmail: null,
        guestPhone: null,
        notes: null,
        ...tokenRevoke,
      },
    });

    const events = await this.prisma.eventRequest.updateMany({
      where: {
        shopId,
        NOT: { guestName: REDACTED },
      },
      data: {
        guestName: REDACTED,
        guestEmail: null,
        guestPhone: null,
        message: null,
        ...tokenRevoke,
      },
    });

    const chats = await this.prisma.guestChat.findMany({
      where: { shopId, NOT: { guestName: REDACTED } },
      select: { id: true },
    });
    for (const c of chats) {
      await this.prisma.$transaction([
        this.prisma.guestChat.update({
          where: { id: c.id },
          data: {
            guestName: REDACTED,
            guestEmail: null,
            guestPhone: null,
            ...tokenRevoke,
          },
        }),
        this.prisma.guestChatMessage.updateMany({
          where: { chatId: c.id },
          data: { body: REDACTED },
        }),
      ]);
    }

    const contacts = await this.prisma.contactMessage.updateMany({
      where: { shopId, NOT: { guestName: REDACTED } },
      data: {
        guestName: REDACTED,
        guestEmail: null,
        guestPhone: null,
        subject: null,
        message: REDACTED,
      },
    });

    const reviews = await this.prisma.venueReview.updateMany({
      where: { shopId, NOT: { guestName: REDACTED } },
      data: {
        guestName: REDACTED,
        guestEmail: null,
        comment: null,
      },
    });

    return {
      reservations: reservations.count,
      eventRequests: events.count,
      guestChats: chats.length,
      contactMessages: contacts.count,
      venueReviews: reviews.count,
    };
  }
}

/** Stable fingerprint helper for tests / digests (not used for auth). */
export function fingerprintEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
