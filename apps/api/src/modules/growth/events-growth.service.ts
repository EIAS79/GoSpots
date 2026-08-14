import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertBookingSlotFree } from '../../common/booking-overlap.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { GuestCheckService } from '../guest-check/guest-check.service';
import { GrowthCapacityService } from './growth-capacity.service';
import type {
  CreateEventChecklistDto,
  CreateEventHoldDto,
  CreateEventProposalDto,
  CreateEventScheduleDto,
  EventTransitionDto,
  MarkEventSchedulePaidDto,
  StartEventDto,
} from './growth.types';

const EVENT_STATES = [
  'INQUIRY',
  'QUOTED',
  'HOLD',
  'DEPOSIT_PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'FINAL_PAYMENT',
  'COMPLETED',
  'CANCELED',
] as const;

type EventState = (typeof EVENT_STATES)[number];

const ALLOWED_TRANSITIONS: Record<EventState, readonly EventState[]> = {
  INQUIRY: ['QUOTED', 'CANCELED'],
  QUOTED: ['HOLD', 'DEPOSIT_PENDING', 'CONFIRMED', 'CANCELED'],
  HOLD: ['QUOTED', 'DEPOSIT_PENDING', 'CONFIRMED', 'CANCELED'],
  DEPOSIT_PENDING: ['CONFIRMED', 'CANCELED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['FINAL_PAYMENT', 'CANCELED'],
  FINAL_PAYMENT: ['COMPLETED', 'CANCELED'],
  COMPLETED: [],
  CANCELED: [],
};

@Injectable()
export class EventsGrowthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly capacity: GrowthCapacityService,
    private readonly guestChecks: GuestCheckService,
  ) {}

  async detail(actor: JwtAccessPayload, eventRequestId: string) {
    const shopId = requireShopId(actor);
    await this.requireEvent(shopId, eventRequestId);
    await this.expireHolds(shopId);
    await this.ensureLifecycle(shopId, eventRequestId, actor.sub);

    const event = await this.requireEvent(shopId, eventRequestId);
    const proposals = await this.prisma.eventProposal.findMany({
      where: { shopId, eventRequestId },
      orderBy: { version: 'desc' },
    });
    const holds = await this.prisma.eventResourceHold.findMany({
      where: { shopId, eventRequestId },
      orderBy: { startsAt: 'asc' },
    });
    const paymentSchedule = await this.prisma.eventPaymentSchedule.findMany({
      where: { shopId, eventRequestId },
      orderBy: { dueAt: 'asc' },
    });
    const execution = await this.prisma.eventExecution.findFirst({
      where: { shopId, eventRequestId },
    });
    const lifecycle = await this.prisma.eventLifecycleEvent.findMany({
      where: { shopId, eventRequestId },
      orderBy: { createdAt: 'asc' },
    });
    const checklist = await this.prisma.eventChecklistItem.findMany({
      where: { shopId, eventRequestId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      event,
      state: lifecycle.at(-1)?.toState ?? 'INQUIRY',
      proposals,
      holds,
      paymentSchedule,
      execution,
      lifecycle,
      checklist,
      profitability: await this.profitabilityForShop(shopId, eventRequestId),
    };
  }

  async createProposal(
    actor: JwtAccessPayload,
    eventRequestId: string,
    dto: CreateEventProposalDto,
  ) {
    const shopId = requireShopId(actor);
    await this.requireEvent(shopId, eventRequestId);
    if (!Number.isInteger(dto.subtotalMinor) || dto.subtotalMinor < 0) {
      throw new BadRequestException('Proposal subtotal must be non-negative.');
    }
    const depositMinor = dto.depositMinor ?? 0;
    if (
      !Number.isInteger(depositMinor) ||
      depositMinor < 0 ||
      depositMinor > dto.subtotalMinor
    ) {
      throw new BadRequestException(
        'Proposal deposit must be between zero and the subtotal.',
      );
    }
    const state = await this.currentState(shopId, eventRequestId, actor.sub);
    if (state !== 'INQUIRY' && state !== 'QUOTED') {
      throw new ConflictException(
        `A proposal cannot be created while the event is ${state}.`,
      );
    }
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });

    const proposal = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`event-proposal:${shopId}:${eventRequestId}`}))`;
      const latest = await tx.eventProposal.findFirst({
        where: { shopId, eventRequestId },
        orderBy: { version: 'desc' },
      });
      const row = await tx.eventProposal.create({
        data: {
          shopId,
          eventRequestId,
          version: (latest?.version ?? 0) + 1,
          subtotalMinor: dto.subtotalMinor,
          depositMinor,
          currency: (dto.currency ?? shop?.currency ?? 'EUR').toUpperCase(),
          terms: {
            schemaVersion: 1,
            ...dto.terms,
          } as Prisma.InputJsonValue,
          validUntil: dto.validUntil
            ? this.parseDate(dto.validUntil, 'validUntil')
            : null,
          createdById: actor.sub,
        },
      });
      if (state !== 'QUOTED') {
        await this.appendLifecycleTx(tx, {
          shopId,
          eventRequestId,
          fromState: state,
          toState: 'QUOTED',
          reason: 'Proposal created',
          actorUserId: actor.sub,
          metadata: { proposalId: row.id },
        });
      }
      return row;
    });

    await this.record(actor, 'event.proposal.create', 'Created event proposal', {
      eventRequestId,
      proposalId: proposal.id,
      version: proposal.version,
      subtotalMinor: proposal.subtotalMinor,
      depositMinor: proposal.depositMinor,
    });
    return proposal;
  }

  async setProposalStatus(
    actor: JwtAccessPayload,
    proposalId: string,
    status: 'SENT' | 'REJECTED',
  ) {
    const shopId = requireShopId(actor);
    const proposal = await this.prisma.eventProposal.findFirst({
      where: { id: proposalId, shopId },
    });
    if (!proposal) throw new NotFoundException('Event proposal not found.');
    if (proposal.status === 'ACCEPTED' || proposal.status === 'SUPERSEDED') {
      throw new ConflictException('Accepted/superseded proposals cannot be changed.');
    }
    if (status === 'SENT' && proposal.validUntil && proposal.validUntil <= new Date()) {
      throw new ConflictException('Expired proposals cannot be sent.');
    }
    const row = await this.prisma.eventProposal.update({
      where: { id: proposal.id },
      data: { status },
    });
    await this.record(actor, 'event.proposal.status', `Set proposal ${status}`, {
      eventRequestId: row.eventRequestId,
      proposalId: row.id,
      status,
    });
    return row;
  }

  async createHold(
    actor: JwtAccessPayload,
    eventRequestId: string,
    dto: CreateEventHoldDto,
  ) {
    const shopId = requireShopId(actor);
    const event = await this.requireEvent(shopId, eventRequestId);
    await this.expireHolds(shopId);
    const state = await this.currentState(shopId, eventRequestId, actor.sub);
    if (state !== 'QUOTED' && state !== 'HOLD') {
      throw new ConflictException('Create a proposal before holding event resources.');
    }

    const startsAt = this.parseDate(dto.startsAt, 'startsAt');
    const endsAt = this.parseDate(dto.endsAt, 'endsAt');
    if (endsAt <= startsAt) {
      throw new BadRequestException('Event hold end must be after start.');
    }
    const expiresAt = dto.expiresAt
      ? this.parseDate(dto.expiresAt, 'expiresAt')
      : new Date(Date.now() + 30 * 60_000);
    if (expiresAt <= new Date()) {
      throw new BadRequestException('Hold expiry must be in the future.');
    }

    await this.capacity.assertResourceIntervalAvailable(
      shopId,
      dto.resourceId,
      startsAt,
      endsAt,
      event.partySize ?? 1,
    );

    const hold = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`event-resource:${shopId}:${dto.resourceId}`}))`;
      await assertBookingSlotFree(tx, shopId, dto.resourceId, startsAt, endsAt);
      await this.assertOperationalConflictFreeTx(
        tx,
        shopId,
        dto.resourceId,
        startsAt,
        endsAt,
        eventRequestId,
      );
      const row = await tx.eventResourceHold.create({
        data: {
          shopId,
          eventRequestId,
          resourceId: dto.resourceId,
          startsAt,
          endsAt,
          expiresAt,
          createdById: actor.sub,
        },
      });
      if (state !== 'HOLD') {
        await this.appendLifecycleTx(tx, {
          shopId,
          eventRequestId,
          fromState: state,
          toState: 'HOLD',
          reason: 'Resource hold created',
          actorUserId: actor.sub,
          metadata: { holdId: row.id },
        });
      }
      return row;
    });

    await this.record(actor, 'event.hold.create', 'Held resource for event', {
      eventRequestId,
      holdId: hold.id,
      resourceId: hold.resourceId,
      expiresAt: hold.expiresAt,
    });
    return hold;
  }

  async acceptProposal(actor: JwtAccessPayload, proposalId: string) {
    const shopId = requireShopId(actor);
    await this.expireHolds(shopId);
    const proposal = await this.prisma.eventProposal.findFirst({
      where: { id: proposalId, shopId },
    });
    if (!proposal) throw new NotFoundException('Event proposal not found.');
    if (proposal.validUntil && proposal.validUntil <= new Date()) {
      throw new ConflictException('The proposal has expired.');
    }
    if (proposal.status === 'ACCEPTED') {
      return this.detail(actor, proposal.eventRequestId);
    }
    if (proposal.status !== 'DRAFT' && proposal.status !== 'SENT') {
      throw new ConflictException('Only an active proposal can be accepted.');
    }
    const activeHolds = await this.prisma.eventResourceHold.count({
      where: {
        shopId,
        eventRequestId: proposal.eventRequestId,
        status: 'HOLD',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (activeHolds === 0) {
      throw new ConflictException(
        'At least one active resource hold is required before acceptance.',
      );
    }

    await this.prisma.eventProposal.update({
      where: { id: proposal.id },
      data: { status: 'ACCEPTED' },
    });
    await this.prisma.eventProposal.updateMany({
      where: {
        shopId,
        eventRequestId: proposal.eventRequestId,
        id: { not: proposal.id },
        status: { in: ['DRAFT', 'SENT'] },
      },
      data: { status: 'SUPERSEDED' },
    });

    if (proposal.depositMinor > 0) {
      const existing = await this.prisma.eventPaymentSchedule.findFirst({
        where: {
          shopId,
          eventRequestId: proposal.eventRequestId,
          proposalId: proposal.id,
          label: 'Deposit',
        },
      });
      if (!existing) {
        await this.prisma.eventPaymentSchedule.create({
          data: {
            shopId,
            eventRequestId: proposal.eventRequestId,
            proposalId: proposal.id,
            label: 'Deposit',
            dueAt: new Date(),
            amountMinor: proposal.depositMinor,
            currency: proposal.currency,
          },
        });
      }
      await this.transition(
        actor,
        proposal.eventRequestId,
        'DEPOSIT_PENDING',
        'Proposal accepted; deposit required',
        { proposalId: proposal.id, depositMinor: proposal.depositMinor },
      );
    } else {
      await this.confirmEvent(actor, proposal.eventRequestId, proposal.id);
    }

    await this.record(actor, 'event.proposal.accept', 'Accepted event proposal', {
      eventRequestId: proposal.eventRequestId,
      proposalId: proposal.id,
      depositMinor: proposal.depositMinor,
    });
    return this.detail(actor, proposal.eventRequestId);
  }

  async createPaymentSchedule(
    actor: JwtAccessPayload,
    eventRequestId: string,
    dto: CreateEventScheduleDto,
  ) {
    const shopId = requireShopId(actor);
    await this.requireEvent(shopId, eventRequestId);
    if (!Number.isInteger(dto.amountMinor) || dto.amountMinor <= 0) {
      throw new BadRequestException('Payment milestone amount must be positive.');
    }
    if (dto.proposalId) {
      const proposal = await this.prisma.eventProposal.findFirst({
        where: { id: dto.proposalId, shopId, eventRequestId },
      });
      if (!proposal) throw new NotFoundException('Event proposal not found.');
    }
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });
    const row = await this.prisma.eventPaymentSchedule.create({
      data: {
        shopId,
        eventRequestId,
        proposalId: dto.proposalId,
        label: dto.label.trim(),
        dueAt: this.parseDate(dto.dueAt, 'dueAt'),
        amountMinor: dto.amountMinor,
        currency: (dto.currency ?? shop?.currency ?? 'EUR').toUpperCase(),
      },
    });
    await this.record(actor, 'event.payment.schedule', 'Created event payment milestone', {
      eventRequestId,
      paymentScheduleId: row.id,
      amountMinor: row.amountMinor,
    });
    return row;
  }

  async markPaymentPaid(
    actor: JwtAccessPayload,
    scheduleId: string,
    dto: MarkEventSchedulePaidDto,
  ) {
    const shopId = requireShopId(actor);
    const schedule = await this.prisma.eventPaymentSchedule.findFirst({
      where: { id: scheduleId, shopId },
    });
    if (!schedule) throw new NotFoundException('Event payment milestone not found.');
    if (schedule.paidAt) return schedule;

    const payment = await this.prisma.payment.findFirst({
      where: { id: dto.paymentId, shopId, status: 'SUCCESS' },
    });
    if (!payment) {
      throw new ConflictException('Successful payment evidence was not found.');
    }
    if (this.decimalToMinor(payment.amount) < schedule.amountMinor) {
      throw new ConflictException(
        'Payment amount is below the event payment milestone amount.',
      );
    }

    const row = await this.prisma.eventPaymentSchedule.update({
      where: { id: schedule.id },
      data: { status: 'PAID', paymentId: payment.id, paidAt: new Date() },
    });

    const proposal = schedule.proposalId
      ? await this.prisma.eventProposal.findFirst({
          where: { id: schedule.proposalId, shopId },
        })
      : await this.prisma.eventProposal.findFirst({
          where: {
            shopId,
            eventRequestId: schedule.eventRequestId,
            status: 'ACCEPTED',
          },
          orderBy: { version: 'desc' },
        });
    if (proposal?.status === 'ACCEPTED' && proposal.depositMinor > 0) {
      const paid = await this.prisma.eventPaymentSchedule.aggregate({
        where: {
          shopId,
          eventRequestId: schedule.eventRequestId,
          proposalId: proposal.id,
          paidAt: { not: null },
        },
        _sum: { amountMinor: true },
      });
      if ((paid._sum.amountMinor ?? 0) >= proposal.depositMinor) {
        const state = await this.currentState(
          shopId,
          schedule.eventRequestId,
          actor.sub,
        );
        if (state === 'DEPOSIT_PENDING' || state === 'HOLD') {
          await this.confirmEvent(actor, schedule.eventRequestId, proposal.id);
        }
      }
    }

    await this.record(actor, 'event.payment.paid', 'Marked event milestone paid', {
      eventRequestId: row.eventRequestId,
      paymentScheduleId: row.id,
      paymentId: row.paymentId,
      amountMinor: row.amountMinor,
    });
    return row;
  }

  async createChecklistItem(
    actor: JwtAccessPayload,
    eventRequestId: string,
    dto: CreateEventChecklistDto,
  ) {
    const shopId = requireShopId(actor);
    await this.requireEvent(shopId, eventRequestId);
    if (!dto.label?.trim()) throw new BadRequestException('Checklist label is required.');
    const row = await this.prisma.eventChecklistItem.create({
      data: {
        shopId,
        eventRequestId,
        label: dto.label.trim(),
        ownerUserId: dto.ownerUserId,
        dueAt: dto.dueAt ? this.parseDate(dto.dueAt, 'dueAt') : null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.record(actor, 'event.checklist.create', 'Added event checklist item', {
      eventRequestId,
      checklistItemId: row.id,
    });
    return row;
  }

  async setChecklistStatus(
    actor: JwtAccessPayload,
    checklistItemId: string,
    status: 'OPEN' | 'DONE',
  ) {
    const shopId = requireShopId(actor);
    const item = await this.prisma.eventChecklistItem.findFirst({
      where: { id: checklistItemId, shopId },
    });
    if (!item) throw new NotFoundException('Event checklist item not found.');
    const row = await this.prisma.eventChecklistItem.update({
      where: { id: item.id },
      data: {
        status,
        completedAt: status === 'DONE' ? new Date() : null,
        completedById: status === 'DONE' ? actor.sub : null,
      },
    });
    await this.record(actor, 'event.checklist.status', 'Updated event checklist item', {
      eventRequestId: row.eventRequestId,
      checklistItemId: row.id,
      status,
    });
    return row;
  }

  async startExecution(
    actor: JwtAccessPayload,
    eventRequestId: string,
    dto: StartEventDto,
  ) {
    const shopId = requireShopId(actor);
    const event = await this.requireEvent(shopId, eventRequestId);
    const state = await this.currentState(shopId, eventRequestId, actor.sub);
    if (state !== 'CONFIRMED') {
      throw new ConflictException(
        `Only a CONFIRMED event can start; current state is ${state}.`,
      );
    }

    let guestCheckId = dto.guestCheckId;
    if (guestCheckId) {
      const check = await this.prisma.guestCheck.findFirst({
        where: { id: guestCheckId, shopId, status: 'OPEN' },
      });
      if (!check) throw new NotFoundException('Open event GuestCheck not found.');
    } else {
      const check = await this.guestChecks.create(actor, {
        guestName: event.guestName,
        guestEmail: event.guestEmail ?? undefined,
        guestPhone: event.guestPhone ?? undefined,
        partySize: event.partySize,
        label: `Event: ${event.eventType}`,
        note: `Event request ${event.id}`,
      });
      guestCheckId = check.id;
    }

    const execution = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.eventExecution.findFirst({
        where: { shopId, eventRequestId },
      });
      const row = existing
        ? await tx.eventExecution.update({
            where: { id: existing.id },
            data: {
              guestCheckId,
              status: 'IN_PROGRESS',
              startedAt: existing.startedAt ?? new Date(),
              canceledAt: null,
            },
          })
        : await tx.eventExecution.create({
            data: {
              shopId,
              eventRequestId,
              guestCheckId,
              status: 'IN_PROGRESS',
              startedAt: new Date(),
            },
          });

      const holds = await tx.eventResourceHold.findMany({
        where: { shopId, eventRequestId, status: 'CONFIRMED' },
        select: { reservationId: true },
      });
      const reservationIds = holds.flatMap((hold) =>
        hold.reservationId ? [hold.reservationId] : [],
      );
      if (reservationIds.length > 0) {
        await tx.reservation.updateMany({
          where: { shopId, id: { in: reservationIds } },
          data: { guestCheckId, version: { increment: 1 } },
        });
      }
      await this.appendLifecycleTx(tx, {
        shopId,
        eventRequestId,
        fromState: state,
        toState: 'IN_PROGRESS',
        reason: 'Event execution started',
        actorUserId: actor.sub,
        metadata: { guestCheckId },
      });
      return row;
    });

    await this.record(actor, 'event.execution.start', 'Started event execution', {
      eventRequestId,
      executionId: execution.id,
      guestCheckId,
    });
    return execution;
  }

  async moveToFinalPayment(actor: JwtAccessPayload, eventRequestId: string) {
    const shopId = requireShopId(actor);
    const state = await this.currentState(shopId, eventRequestId, actor.sub);
    if (state !== 'IN_PROGRESS') {
      throw new ConflictException('Only an in-progress event can close service.');
    }
    const openChecklist = await this.prisma.eventChecklistItem.count({
      where: { shopId, eventRequestId, status: 'OPEN' },
    });
    if (openChecklist > 0) {
      throw new ConflictException(
        `${openChecklist} event checklist item(s) are still open.`,
      );
    }
    await this.transition(
      actor,
      eventRequestId,
      'FINAL_PAYMENT',
      'Event service completed; awaiting final settlement',
    );
    return this.detail(actor, eventRequestId);
  }

  async finishExecution(
    actor: JwtAccessPayload,
    eventRequestId: string,
    outcome: 'COMPLETED' | 'CANCELED',
  ) {
    const shopId = requireShopId(actor);
    let state = await this.currentState(shopId, eventRequestId, actor.sub);
    let execution = await this.prisma.eventExecution.findFirst({
      where: { shopId, eventRequestId },
    });

    if (outcome === 'COMPLETED') {
      if (state === 'IN_PROGRESS') {
        await this.moveToFinalPayment(actor, eventRequestId);
        state = 'FINAL_PAYMENT';
      }
      if (state !== 'FINAL_PAYMENT') {
        throw new ConflictException(
          `Event cannot complete from lifecycle state ${state}.`,
        );
      }
      execution =
        execution ??
        (await this.prisma.eventExecution.findFirst({ where: { shopId, eventRequestId } }));
      if (!execution?.guestCheckId) {
        throw new ConflictException('Event has no GuestCheck to settle.');
      }
      const guestCheck = await this.prisma.guestCheck.findFirst({
        where: { id: execution.guestCheckId, shopId },
      });
      if (!guestCheck || guestCheck.status !== 'SETTLED') {
        throw new ConflictException(
          'Final event GuestCheck must be SETTLED before completion.',
        );
      }
      const unpaidDue = await this.prisma.eventPaymentSchedule.count({
        where: {
          shopId,
          eventRequestId,
          paidAt: null,
          dueAt: { lte: new Date() },
        },
      });
      if (unpaidDue > 0) {
        throw new ConflictException(
          `${unpaidDue} due event payment milestone(s) remain unpaid.`,
        );
      }
    } else if (state === 'COMPLETED') {
      throw new ConflictException('A completed event cannot be canceled.');
    }

    const now = new Date();
    const row = execution
      ? await this.prisma.eventExecution.update({
          where: { id: execution.id },
          data:
            outcome === 'COMPLETED'
              ? { status: outcome, completedAt: now }
              : { status: outcome, canceledAt: now },
        })
      : await this.prisma.eventExecution.create({
          data: {
            shopId,
            eventRequestId,
            status: outcome,
            completedAt: outcome === 'COMPLETED' ? now : null,
            canceledAt: outcome === 'CANCELED' ? now : null,
          },
        });

    const latest = await this.currentState(shopId, eventRequestId, actor.sub);
    if (latest !== outcome) {
      await this.transition(
        actor,
        eventRequestId,
        outcome,
        outcome === 'COMPLETED' ? 'Final settlement completed' : 'Event canceled',
      );
    }
    if (outcome === 'CANCELED') {
      await this.prisma.eventResourceHold.updateMany({
        where: { shopId, eventRequestId, status: 'HOLD' },
        data: { status: 'RELEASED' },
      });
    }

    await this.record(actor, 'event.execution.finish', `Marked event ${outcome}`, {
      eventRequestId,
      executionId: row.id,
      outcome,
    });
    return {
      execution: row,
      profitability: await this.profitabilityForShop(shopId, eventRequestId),
    };
  }

  async transitionExplicit(
    actor: JwtAccessPayload,
    eventRequestId: string,
    dto: EventTransitionDto,
  ) {
    const target = dto.toState as EventState;
    if (!EVENT_STATES.includes(target)) {
      throw new BadRequestException('Unsupported event lifecycle state.');
    }
    if (target === 'COMPLETED') {
      return this.finishExecution(actor, eventRequestId, 'COMPLETED');
    }
    if (target === 'CANCELED') {
      return this.finishExecution(actor, eventRequestId, 'CANCELED');
    }
    if (target === 'FINAL_PAYMENT') {
      return this.moveToFinalPayment(actor, eventRequestId);
    }
    await this.transition(actor, eventRequestId, target, dto.reason);
    return this.detail(actor, eventRequestId);
  }

  async profitability(actor: JwtAccessPayload, eventRequestId: string) {
    return this.profitabilityForShop(requireShopId(actor), eventRequestId);
  }

  async expireHolds(shopId: string, at = new Date()) {
    const stale = await this.prisma.eventResourceHold.findMany({
      where: { shopId, status: 'HOLD', expiresAt: { lte: at } },
    });
    if (stale.length === 0) return { expired: 0 };

    await this.prisma.$transaction(async (tx) => {
      await tx.eventResourceHold.updateMany({
        where: {
          shopId,
          id: { in: stale.map((hold) => hold.id) },
          status: 'HOLD',
        },
        data: { status: 'EXPIRED' },
      });
      const eventIds = [...new Set(stale.map((hold) => hold.eventRequestId))];
      for (const eventRequestId of eventIds) {
        const remaining = await tx.eventResourceHold.count({
          where: { shopId, eventRequestId, status: 'HOLD' },
        });
        if (remaining > 0) continue;
        const latest = await tx.eventLifecycleEvent.findFirst({
          where: { shopId, eventRequestId },
          orderBy: { createdAt: 'desc' },
        });
        if (latest?.toState === 'HOLD') {
          await this.appendLifecycleTx(tx, {
            shopId,
            eventRequestId,
            fromState: 'HOLD',
            toState: 'QUOTED',
            reason: 'All temporary resource holds expired',
            actorUserId: null,
            metadata: {
              expiredHoldIds: stale
                .filter((hold) => hold.eventRequestId === eventRequestId)
                .map((hold) => hold.id),
            },
          });
        }
      }
    });
    return { expired: stale.length };
  }

  private async confirmEvent(
    actor: JwtAccessPayload,
    eventRequestId: string,
    proposalId: string,
  ) {
    const shopId = requireShopId(actor);
    const event = await this.requireEvent(shopId, eventRequestId);
    const state = await this.currentState(shopId, eventRequestId, actor.sub);
    if (state === 'CONFIRMED') return;
    if (
      state !== 'HOLD' &&
      state !== 'DEPOSIT_PENDING' &&
      state !== 'QUOTED'
    ) {
      throw new ConflictException(`Event cannot confirm from ${state}.`);
    }

    const holds = await this.prisma.eventResourceHold.findMany({
      where: {
        shopId,
        eventRequestId,
        status: 'HOLD',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { resourceId: 'asc' },
    });
    if (holds.length === 0) {
      throw new ConflictException('No active event resource holds remain.');
    }

    await this.prisma.$transaction(async (tx) => {
      const resourceIds = [...new Set(holds.map((hold) => hold.resourceId))].sort();
      for (const resourceId of resourceIds) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`event-confirm:${shopId}:${resourceId}`}))`;
      }
      for (const hold of holds) {
        await assertBookingSlotFree(
          tx,
          shopId,
          hold.resourceId,
          hold.startsAt,
          hold.endsAt,
        );
        await this.assertOperationalConflictFreeTx(
          tx,
          shopId,
          hold.resourceId,
          hold.startsAt,
          hold.endsAt,
          eventRequestId,
        );
        const reservation = await tx.reservation.create({
          data: {
            shopId,
            resourceId: hold.resourceId,
            guestName: event.guestName,
            guestEmail: event.guestEmail,
            guestPhone: event.guestPhone,
            partySize: event.partySize,
            startsAt: hold.startsAt,
            endsAt: hold.endsAt,
            status: 'CONFIRMED',
            notes: `Event ${event.eventType} · ${eventRequestId}`,
          },
        });
        await tx.reservationBookingEvidence.create({
          data: {
            shopId,
            reservationId: reservation.id,
            sourceChannel: 'EVENT',
            assignedResourceId: hold.resourceId,
          },
        });
        await tx.eventResourceHold.update({
          where: { id: hold.id },
          data: { status: 'CONFIRMED', reservationId: reservation.id },
        });
      }
      await this.appendLifecycleTx(tx, {
        shopId,
        eventRequestId,
        fromState: state,
        toState: 'CONFIRMED',
        reason: 'Deposit gate satisfied; holds converted to reservations',
        actorUserId: actor.sub,
        metadata: { proposalId },
      });
    });
  }

  private async assertOperationalConflictFreeTx(
    tx: Prisma.TransactionClient,
    shopId: string,
    resourceId: string,
    startsAt: Date,
    endsAt: Date,
    currentEventRequestId: string,
  ) {
    const maintenance = await tx.resourceMaintenancePeriod.findFirst({
      where: {
        shopId,
        resourceId,
        startsAt: { lt: endsAt },
        OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
      },
    });
    if (maintenance) {
      throw new ConflictException('Resource entered maintenance before event confirmation.');
    }
    const session = await tx.operationsSession.findFirst({
      where: {
        shopId,
        resourceId,
        status: { in: ['ACTIVE', 'PAUSED'] },
        startedAt: { lt: endsAt },
        OR: [{ finishedAt: null }, { finishedAt: { gt: startsAt } }],
      },
    });
    if (session) {
      throw new ConflictException('Resource is occupied by an active session.');
    }
    const otherHold = await tx.eventResourceHold.findFirst({
      where: {
        shopId,
        resourceId,
        eventRequestId: { not: currentEventRequestId },
        status: { in: ['HOLD', 'CONFIRMED'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (otherHold) {
      throw new ConflictException('Resource is held by another event.');
    }
  }

  private async transition(
    actor: JwtAccessPayload,
    eventRequestId: string,
    toState: EventState,
    reason?: string,
    metadata?: Record<string, unknown>,
  ) {
    const shopId = requireShopId(actor);
    await this.requireEvent(shopId, eventRequestId);
    const fromState = await this.currentState(shopId, eventRequestId, actor.sub);
    if (fromState === toState) return toState;
    if (!ALLOWED_TRANSITIONS[fromState].includes(toState)) {
      throw new ConflictException(
        `Event lifecycle cannot transition from ${fromState} to ${toState}.`,
      );
    }
    await this.prisma.eventLifecycleEvent.create({
      data: {
        shopId,
        eventRequestId,
        fromState,
        toState,
        reason: reason?.trim() || null,
        actorUserId: actor.sub,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
    return toState;
  }

  private async currentState(
    shopId: string,
    eventRequestId: string,
    actorUserId?: string,
  ): Promise<EventState> {
    await this.ensureLifecycle(shopId, eventRequestId, actorUserId);
    const row = await this.prisma.eventLifecycleEvent.findFirst({
      where: { shopId, eventRequestId },
      orderBy: { createdAt: 'desc' },
    });
    return (row?.toState as EventState | undefined) ?? 'INQUIRY';
  }

  private async ensureLifecycle(
    shopId: string,
    eventRequestId: string,
    actorUserId?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`event-lifecycle:${shopId}:${eventRequestId}`}))`;
      const existing = await tx.eventLifecycleEvent.findFirst({
        where: { shopId, eventRequestId },
        select: { id: true },
      });
      if (existing) return;
      await tx.eventLifecycleEvent.create({
        data: {
          shopId,
          eventRequestId,
          fromState: null,
          toState: 'INQUIRY',
          reason: 'Event operational lifecycle initialized',
          actorUserId: actorUserId ?? null,
        },
      });
    });
  }

  private async appendLifecycleTx(
    tx: Prisma.TransactionClient,
    input: {
      shopId: string;
      eventRequestId: string;
      fromState: string | null;
      toState: EventState;
      reason: string;
      actorUserId: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    await tx.eventLifecycleEvent.create({
      data: {
        shopId: input.shopId,
        eventRequestId: input.eventRequestId,
        fromState: input.fromState,
        toState: input.toState,
        reason: input.reason,
        actorUserId: input.actorUserId,
        metadata: input.metadata
          ? (input.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  private async profitabilityForShop(shopId: string, eventRequestId: string) {
    const execution = await this.prisma.eventExecution.findFirst({
      where: { shopId, eventRequestId },
    });
    const holds = await this.prisma.eventResourceHold.findMany({
      where: { shopId, eventRequestId },
      orderBy: { startsAt: 'asc' },
    });
    const start = execution?.startedAt ?? holds[0]?.startsAt ?? null;
    const end =
      execution?.completedAt ??
      holds.reduce<Date | null>(
        (latest, hold) => (latest == null || hold.endsAt > latest ? hold.endsAt : latest),
        null,
      );

    const ledger = execution?.guestCheckId
      ? await this.prisma.ledgerEntry.findMany({
          where: { shopId, guestCheckId: execution.guestCheckId },
        })
      : [];
    const eventInventory = await this.prisma.stockMovement.findMany({
      where: { shopId, referenceType: 'EVENT', referenceId: eventRequestId },
    });
    const milestones = await this.prisma.eventPaymentSchedule.findMany({
      where: { shopId, eventRequestId },
    });
    const punches =
      start && end
        ? await this.prisma.timePunch.findMany({
            where: {
              shopId,
              startedAt: { lt: end },
              OR: [{ endedAt: null }, { endedAt: { gt: start } }],
            },
          })
        : [];

    let guestCheckRevenueMinor = 0;
    for (const row of ledger) {
      const minor = Math.abs(this.decimalToMinor(row.amount));
      if (row.kind === 'SALE') guestCheckRevenueMinor += minor;
      if (row.kind === 'REFUND') guestCheckRevenueMinor -= minor;
    }
    const paidMilestonesMinor = milestones
      .filter((milestone) => milestone.paidAt != null)
      .reduce((sum, milestone) => sum + milestone.amountMinor, 0);
    let inventoryCostMinor = 0;
    for (const movement of eventInventory) {
      if (movement.kind === 'SALE_CONSUMPTION') {
        inventoryCostMinor += Math.abs(movement.totalCostMinor);
      } else if (movement.kind === 'SALE_REVERSAL') {
        inventoryCostMinor -= Math.abs(movement.totalCostMinor);
      } else if (movement.kind === 'WASTE') {
        inventoryCostMinor += Math.abs(movement.totalCostMinor);
      }
    }
    let laborCostMinor = 0;
    if (start && end) {
      for (const punch of punches) {
        const punchEnd = punch.endedAt ?? end;
        const overlapStart = Math.max(start.getTime(), punch.startedAt.getTime());
        const overlapEnd = Math.min(end.getTime(), punchEnd.getTime());
        const seconds = Math.max(0, (overlapEnd - overlapStart) / 1000);
        laborCostMinor += Math.round((seconds / 3600) * punch.hourlyRateMinor);
      }
    }
    const recognizedRevenueMinor = Math.max(
      guestCheckRevenueMinor,
      paidMilestonesMinor,
    );

    return {
      currency:
        ledger[0]?.currency ?? milestones[0]?.currency ?? null,
      guestCheckRevenueMinor,
      paidMilestonesMinor,
      recognizedRevenueMinor,
      inventoryCostMinor,
      laborCostMinor,
      contributionMinor:
        recognizedRevenueMinor - inventoryCostMinor - laborCostMinor,
      inputs: {
        guestCheckId: execution?.guestCheckId ?? null,
        stockMovementCount: eventInventory.length,
        timePunchCount: punches.length,
        eventWindowStart: start,
        eventWindowEnd: end,
      },
    };
  }

  private async requireEvent(shopId: string, eventRequestId: string) {
    const row = await this.prisma.eventRequest.findFirst({
      where: { id: eventRequestId, shopId },
    });
    if (!row) throw new NotFoundException('Event request not found.');
    return row;
  }

  private parseDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date/time.`);
    }
    return date;
  }

  private decimalToMinor(value: { toString(): string }) {
    return Math.round(Number(value.toString()) * 100);
  }

  private record(
    actor: JwtAccessPayload,
    action: string,
    summary: string,
    meta: Record<string, unknown>,
  ) {
    return this.audit.record(actor, {
      section: 'reservation',
      action,
      summary,
      meta,
    });
  }
}
