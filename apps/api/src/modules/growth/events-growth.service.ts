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

const ALLOWED_TRANSITIONS: Record<EventState, EventState[]> = {
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

    const [event, proposals, holds, schedules, execution, lifecycle, checklist] =
      await Promise.all([
        this.requireEvent(shopId, eventRequestId),
        this.prisma.eventProposal.findMany({
          where: { shopId, eventRequestId },
          orderBy: { version: 'desc' },
        }),
        this.prisma.eventResourceHold.findMany({
          where: { shopId, eventRequestId },
          orderBy: { startsAt: 'asc' },
        }),
        this.prisma.eventPaymentSchedule.findMany({
          where: { shopId, eventRequestId },
          orderBy: { dueAt: 'asc' },
        }),
        this.prisma.eventExecution.findFirst({ where: { shopId, eventRequestId } }),
        this.prisma.eventLifecycleEvent.findMany({
          where: { shopId, eventRequestId },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.eventChecklistItem.findMany({
          where: { shopId, eventRequestId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
      ]);

    return {
      event,
      state: lifecycle.at(-1)?.toState ?? 'INQUIRY',
      proposals,
      holds,
      paymentSchedule: schedules,
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
    if (
      !Number.isInteger(dto.depositMinor ?? 0) ||
      Number(dto.depositMinor ?? 0) < 0 ||
      Number(dto.depositMinor ?? 0) > dto.subtotalMinor
    ) {
      throw new BadRequestException(
        'Proposal deposit must be between zero and the subtotal.',
      );
    }
    const current = await this.currentState(shopId, eventRequestId, actor.sub);
    if (!['INQUIRY', 'QUOTED'].includes(current)) {
      throw new ConflictException(
        `A proposal cannot be created while the event is ${current}.`,
      );
    }

    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`event-proposal:${shopId}:${eventRequestId}`}))`;
      const latest = await tx.eventProposal.findFirst({
        where: { shopId, eventRequestId },
        orderBy: { version: 'desc' },
      });
      const proposal = await tx.eventProposal.create({
        data: {
          shopId,
          eventRequestId,
          version: (latest?.version ?? 0) + 1,
          subtotalMinor: dto.subtotalMinor,
          depositMinor: dto.depositMinor ?? 0,
          currency: (dto.currency ?? shop?.currency ?? 'EUR').toUpperCase(),
          terms: { schemaVersion: 1, ...dto.terms } as Prisma.InputJsonValue,
          validUntil: dto.validUntil ? this.date(dto.validUntil, 'validUntil') : null,
          createdById: actor.sub,
        },
      });
      if (current !== 'QUOTED') {
        await tx.eventLifecycleEvent.create({
          data: {
            shopId,
            eventRequestId,
            fromState: current,
            toState: 'QUOTED',
            reason: 'Proposal created',
            actorUserId: actor.sub,
            metadata: { proposalId: proposal.id } as Prisma.InputJsonValue,
          },
        });
      }
      return proposal;
    });
    await this.record(actor, 'event.proposal.create', 'Created event proposal', {
      eventRequestId,
      proposalId: row.id,
      version: row.version,
      subtotalMinor: row.subtotalMinor,
      depositMinor: row.depositMinor,
    });
    return row;
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
    if (proposal.status === 'ACCEPTED') {
      throw new ConflictException('An accepted proposal cannot be changed.');
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
    const current = await this.currentState(shopId, eventRequestId, actor.sub);
    if (!['QUOTED', 'HOLD'].includes(current)) {
      throw new ConflictException('Create a proposal before holding event resources.');
    }
    const startsAt = this.date(dto.startsAt, 'startsAt');
    const endsAt = this.date(dto.endsAt, 'endsAt');
    this.assertInterval(startsAt, endsAt);
    const expiresAt = dto.expiresAt
      ? this.date(dto.expiresAt, 'expiresAt')
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

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`event-resource:${shopId}:${dto.resourceId}`}))`;
      await assertBookingSlotFree(tx, shopId, dto.resourceId, startsAt, endsAt);
      const otherHold = await tx.eventResourceHold.findFirst({
        where: {
          shopId,
          resourceId: dto.resourceId,
          eventRequestId: { not: eventRequestId },
          status: { in: ['HOLD', 'CONFIRMED'] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (otherHold) {
        throw new ConflictException('Resource is already held by another event.');
      }
      const hold = await tx.eventResourceHold.create({
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
      if (current !== 'HOLD') {
        await tx.eventLifecycleEvent.create({
          data: {
            shopId,
            eventRequestId,
            fromState: current,
            toState: 'HOLD',
            reason: 'Resource hold created',
            actorUserId: actor.sub,
            metadata: { holdId: hold.id } as Prisma.InputJsonValue,
          },
        });
      }
      return hold;
    });
    await this.record(actor, 'event.hold.create', 'Held resource for event', {
      eventRequestId,
      holdId: row.id,
      resourceId: row.resourceId,
      expiresAt: row.expiresAt,
    });
    return row;
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
    if (!['DRAFT', 'SENT'].includes(proposal.status)) {
      if (proposal.status === 'ACCEPTED') {
        return this.detail(actor, proposal.eventRequestId);
      }
      throw new ConflictException('Only an active proposal can be accepted.');
    }
    const holds = await this.prisma.eventResourceHold.findMany({
      where: {
        shopId,
        eventRequestId: proposal.eventRequestId,
        status: 'HOLD',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (holds.length === 0) {
      throw new ConflictException(
        'At least one active resource hold is required before acceptance.',
      );
    }

    await this.prisma.eventProposal.update({
      where: { id: proposal.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
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
      const existingDeposit = await this.prisma.eventPaymentSchedule.findFirst({
        where: {
          shopId,
          eventRequestId: proposal.eventRequestId,
          proposalId: proposal.id,
          label: 'Deposit',
        },
      });
      if (!existingDeposit) {
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
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });
    if (dto.proposalId) {
      const proposal = await this.prisma.eventProposal.findFirst({
        where: { id: dto.proposalId, shopId, eventRequestId },
      });
      if (!proposal) throw new NotFoundException('Event proposal not found.');
    }
    const row = await this.prisma.eventPaymentSchedule.create({
      data: {
        shopId,
        eventRequestId,
        proposalId: dto.proposalId,
        label: dto.label.trim(),
        dueAt: this.date(dto.dueAt, 'dueAt'),
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
    const paidAmountMinor = this.decimalToMinor(payment.amount);
    if (paidAmountMinor < schedule.amountMinor) {
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
        dueAt: dto.dueAt ? this.date(dto.dueAt, 'dueAt') : null,
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
      const created = await this.guestChecks.create(actor, {
        guestName: event.guestName,
        guestEmail: event.guestEmail ?? undefined,
        guestPhone: event.guestPhone ?? undefined,
        partySize: event.partySize,
        label: `Event: ${event.eventType}`,
        note: `Event request ${event.id}`,
      });
      guestCheckId = created.id;
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
          data: { guestCheckId },
        });
      }
      await this.appendTransitionTx(
        tx,
        shopId,
        eventRequestId,
        state,
        'IN_PROGRESS',
        'Event execution started',
        actor.sub,
        { guestCheckId },
      );
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
    status: 'COMPLETED' | 'CANCELED',
  ) {
    const shopId = requireShopId(actor);
    const current = await this.currentState(shopId, eventRequestId, actor.sub);
    let execution = await this.prisma.eventExecution.findFirst({
      where: { shopId, eventRequestId },
    });

    if (status === 'COMPLETED') {
      if (current === 'IN_PROGRESS') {
        await this.moveToFinalPayment(actor, eventRequestId);
      } else if (current !== 'FINAL_PAYMENT') {
        throw new ConflictException(
          `Event cannot complete from lifecycle state ${current}.`,
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
      const unpaid = await this.prisma.eventPaymentSchedule.count({
        where: {
          shopId,
          eventRequestId,
          paidAt: null,
          dueAt: { lte: new Date() },
        },
      });
      if (unpaid > 0) {
        throw new ConflictException(
          `${unpaid} due event payment milestone(s) remain unpaid.`,
        );
      }
    } else if (current === 'COMPLETED') {
      throw new ConflictException('A completed event cannot be canceled.');
    }

    const now = new Date();
    const row = execution
      ? await this.prisma.eventExecution.update({
          where: { id: execution.id },
          data: {
            status,
            completedAt: status === 'COMPLETED' ? now : execution.completedAt,
            canceledAt: status === 'CANCELED' ? now : execution.canceledAt,
          },
        })
      : await this.prisma.eventExecution.create({
          data: {
            shopId,
            eventRequestId,
            status,
            completedAt: status === 'COMPLETED' ? now : null,
            canceledAt: status === 'CANCELED' ? now : null,
          },
        });

    const latestState = await this.currentState(shopId, eventRequestId, actor.sub);
    if (latestState !== status) {
      await this.transition(
        actor,
        eventRequestId,
        status,
        status === 'COMPLETED' ? 'Final settlement completed' : 'Event canceled',
      );
    }
    if (status === 'CANCELED') {
      await this.prisma.eventResourceHold.updateMany({
        where: { shopId, eventRequestId, status: 'HOLD' },
        data: { status: 'RELEASED' },
      });
    }
    await this.record(actor, 'event.execution.finish', `Marked event ${status}`, {
      eventRequestId,
      executionId: row.id,
      status,
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

  async expireHolds(shopId: string, at = new Date()) {
    const stale = await this.prisma.eventResourceHold.findMany({
      where: { shopId, status: 'HOLD', expiresAt: { lte: at } },
    });
    if (stale.length === 0) return { expired: 0 };

    await this.prisma.$transaction(async (tx) => {
      await tx.eventResourceHold.updateMany({
        where: { id: { in: stale.map((hold) => hold.id) }, shopId, status: 'HOLD' },
        data: { status: 'EXPIRED' },
      });
      for (const eventRequestId of [...new Set(stale.map((hold) => hold.eventRequestId))]) {
        const remaining = await tx.eventResourceHold.count({
          where: { shopId, eventRequestId, status: 'HOLD' },
        });
        if (remaining === 0) {
          const last = await tx.eventLifecycleEvent.findFirst({
            where: { shopId, eventRequestId },
            orderBy: { createdAt: 'desc' },
          });
          if (last?.toState === 'HOLD') {
            await tx.eventLifecycleEvent.create({
              data: {
                shopId,
                eventRequestId,
                fromState: 'HOLD',
                toState: 'QUOTED',
                reason: 'All temporary resource holds expired',
                metadata: {
                  expiredHoldIds: stale
                    .filter((hold) => hold.eventRequestId === eventRequestId)
                    .map((hold) => hold.id),
                } as Prisma.InputJsonValue,
              },
            });
          }
        }
      }
    });
    return { expired: stale.length };
  }

  async profitability(actor: JwtAccessPayload, eventRequestId: string) {
    return this.profitabilityForShop(requireShopId(actor), eventRequestId);
  }

  private async confirmEvent(
    actor: JwtAccessPayload,
    eventRequestId: string,
    proposalId: string,
  ) {
    const shopId = requireShopId(actor);
    const event = await this.requireEvent(shopId, eventRequestId);
    const current = await this.currentState(shopId, eventRequestId, actor.sub);
    if (!['HOLD', 'DEPOSIT_PENDING', 'QUOTED'].includes(current)) {
      if (current === 'CONFIRMED') return;
      throw new ConflictException(`Event cannot confirm from ${current}.`);
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
        await assertBookingSlotFree(tx, shopId, hold.resourceId, hold.startsAt, hold.endsAt);
        const otherHold = await tx.eventResourceHold.findFirst({
          where: {
            shopId,
            resourceId: hold.resourceId,
            eventRequestId: { not: eventRequestId },
            status: { in: ['HOLD', 'CONFIRMED'] },
            startsAt: { lt: hold.endsAt },
            endsAt: { gt: hold.startsAt },
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        });
        if (otherHold) {
          throw new ConflictException(
            'An event resource was claimed by another event before confirmation.',
          );
        }
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
      await this.appendTransitionTx(
        tx,
        shopId,
        eventRequestId,
        current,
        'CONFIRMED',
        'Deposit requirement satisfied and resources converted to reservations',
        actor.sub,
        { proposalId },
      );
    });
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
    const current = await this.currentState(shopId, eventRequestId, actor.sub);
    if (current === toState) return current;
    if (!ALLOWED_TRANSITIONS[current].includes(toState)) {
      throw new ConflictException(
        `Event lifecycle cannot transition from ${current} to ${toState}.`,
      );
    }
    await this.prisma.eventLifecycleEvent.create({
      data: {
        shopId,
        eventRequestId,
        fromState: current,
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
    const existing = await this.prisma.eventLifecycleEvent.findFirst({
      where: { shopId, eventRequestId },
      select: { id: true },
    });
    if (existing) return;
    await this.prisma.eventLifecycleEvent.create({
      data: {
        shopId,
        eventRequestId,
        fromState: null,
        toState: 'INQUIRY',
        reason: 'Event operational lifecycle initialized',
        actorUserId: actorUserId ?? null,
      },
    });
  }

  private async appendTransitionTx(
    tx: Prisma.TransactionClient,
    shopId: string,
    eventRequestId: string,
    fromState: string,
    toState: EventState,
    reason: string,
    actorUserId: string,
    metadata?: Record<string, unknown>,
  ) {
    await tx.eventLifecycleEvent.create({
      data: {
        shopId,
        eventRequestId,
        fromState,
        toState,
        reason,
        actorUserId,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
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

    const [ledger, eventInventory, milestones, punches] = await Promise.all([
      execution?.guestCheckId
        ? this.prisma.ledgerEntry.findMany({
            where: { shopId, guestCheckId: execution.guestCheckId },
          })
        : Promise.resolve([]),
      this.prisma.stockMovement.findMany({
        where: { shopId, referenceType: 'EVENT', referenceId: eventRequestId },
      }),
      this.prisma.eventPaymentSchedule.findMany({ where: { shopId, eventRequestId } }),
      start && end
        ? this.prisma.timePunch.findMany({
            where: {
              shopId,
              startedAt: { lt: end },
              OR: [{ endedAt: null }, { endedAt: { gt: start } }],
            },
          })
        : Promise.resolve([]),
    ]);

    const guestCheckRevenueMinor = ledger.reduce((sum, row) => {
      const minor = this.decimalToMinor(row.amount);
      if (row.kind === 'SALE') return sum + minor;
      if (row.kind === 'REFUND') return sum - minor;
      return sum;
    }, 0);
    const paidMilestonesMinor = milestones
      .filter((milestone) => milestone.paidAt != null)
      .reduce((sum, milestone) => sum + milestone.amountMinor, 0);
    const inventoryCostMinor = eventInventory.reduce(
      (sum, movement) =>
        sum + (movement.kind === 'CONSUME' ? Math.abs(movement.totalCostMinor) : 0),
      0,
    );
    const laborCostMinor =
      start && end
        ? punches.reduce((sum, punch) => {
            const punchEnd = punch.endedAt ?? end;
            const overlapStart = Math.max(start.getTime(), punch.startedAt.getTime());
            const overlapEnd = Math.min(end.getTime(), punchEnd.getTime());
            const seconds = Math.max(0, (overlapEnd - overlapStart) / 1000);
            return sum + Math.round((seconds / 3600) * punch.hourlyRateMinor);
          }, 0)
        : 0;
    const recognizedRevenueMinor = Math.max(
      guestCheckRevenueMinor,
      paidMilestonesMinor,
    );
    return {
      currency:
        execution?.guestCheckId && ledger[0]?.currency
          ? ledger[0].currency
          : milestones[0]?.currency ?? null,
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

  private date(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date/time.`);
    }
    return date;
  }

  private assertInterval(start: Date, end: Date) {
    if (end <= start) {
      throw new BadRequestException('Event hold end must be after start.');
    }
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
