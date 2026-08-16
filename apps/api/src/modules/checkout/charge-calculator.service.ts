import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type BookingMode } from '@prisma/client';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiConflictException } from '../../common/api-error.util';
import {
  isMoneyZero,
  lineTotalDecimal,
  normalizeMoneyCurrency,
  roundMoneyDecimal,
  serializeMoney,
  sumMoneyDecimal,
  toPrismaDecimal,
  type MoneyInput,
} from '../../common/money.util';
import { PlayBillingService } from '../finance/play-billing.service';

export type ChargeSourceType =
  | 'SHOP_ORDER'
  | 'PLAY_SESSION'
  | 'RESERVATION'
  | 'VENUE_ORDER'
  | 'OPERATIONS_SESSION'
  | 'SERVICE_CHARGE'
  | 'TIP';

export type CheckoutChargeLine = {
  position: number;
  sourceType: ChargeSourceType;
  sourceId: string;
  lineReference: string | null;
  description: string;
  quantity: number;
  unitAmount: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  finalAmount: Prisma.Decimal;
  currency: string;
  pricingMetadata: Prisma.InputJsonValue;
};

export type CheckoutSourceCheck = {
  id: string;
  shopId: string;
  version: number;
  status: string;
  currency: string | null;
  shop: { currency: string };
  shopOrders: Array<{
    id: string;
    status: string;
    label: string | null;
    total: MoneyInput;
    tableReserved: boolean;
    reservationFee: MoneyInput;
    currency: string | null;
    lines: Array<{
      id: string;
      name: string;
      quantity: number;
      unitPrice: MoneyInput;
      lineStatus: string;
    }>;
  }>;
  playSessions: Array<{
    id: string;
    status: string;
    label: string | null;
    amount: MoneyInput;
    currency: string | null;
    billingDiscountPercent: number;
    completedAt: Date | null;
    reservationId: string | null;
  }>;
  reservations: Array<{
    id: string;
    status: string;
    guestName: string;
    partySize: number;
    startsAt: Date;
    endsAt: Date;
    billedAmount: MoneyInput;
    billingBaseAmount: MoneyInput;
    billingDiscountPercent: number;
    billedAt: Date | null;
    currency: string | null;
    resourceId: string | null;
    notes: string | null;
    resource: {
      id: string;
      name: string;
      type: string;
      hourlyRate: MoneyInput;
      category: {
        id: string;
        name: string;
        slotMinutes: number;
        bookingMode: BookingMode;
        offeringConfig: unknown;
        rates: Array<{
          label: string;
          durationMinutes: number | null;
          price: MoneyInput;
        }>;
      } | null;
    } | null;
  }>;
};

export type CheckoutPreview = {
  checkId: string;
  checkVersion: number;
  sourceHash: string;
  currency: string;
  subtotal: Prisma.Decimal;
  adjustments: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  depositAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  amountDue: Prisma.Decimal;
  lines: CheckoutChargeLine[];
};

function clampDiscountPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function discountedAmount(
  base: Prisma.Decimal,
  discountPercent: number,
): { finalAmount: Prisma.Decimal; discountAmount: Prisma.Decimal } {
  const pct = new Prisma.Decimal(clampDiscountPercent(discountPercent).toString());
  const finalAmount = roundMoneyDecimal(
    base.mul(new Prisma.Decimal(100).sub(pct)).div(100),
    2,
  );
  return {
    finalAmount,
    discountAmount: base.sub(finalAmount),
  };
}

function stableLine(line: CheckoutChargeLine) {
  return {
    position: line.position,
    sourceType: line.sourceType,
    sourceId: line.sourceId,
    lineReference: line.lineReference,
    description: line.description,
    quantity: line.quantity,
    unitAmount: serializeMoney(line.unitAmount),
    grossAmount: serializeMoney(line.grossAmount),
    discountAmount: serializeMoney(line.discountAmount),
    finalAmount: serializeMoney(line.finalAmount),
    currency: line.currency,
    pricingMetadata: line.pricingMetadata,
  };
}

@Injectable()
export class ChargeCalculatorService {
  constructor(private readonly playBilling: PlayBillingService) {}

  calculate(check: CheckoutSourceCheck, now = new Date()): CheckoutPreview {
    const currency = normalizeMoneyCurrency(check.currency ?? check.shop.currency);
    const lines: CheckoutChargeLine[] = [];
    let position = 0;

    const assertCurrency = (
      sourceType: ChargeSourceType,
      sourceId: string,
      sourceCurrency: string | null,
    ) => {
      if (!sourceCurrency) return;
      const normalized = normalizeMoneyCurrency(sourceCurrency);
      if (normalized !== currency) {
        throw apiConflictException(
          ApiDomainErrorCode.STATE_CONFLICT,
          'Guest check contains charges in more than one currency',
          {
            sourceType,
            sourceId,
            expectedCurrency: currency,
            actualCurrency: normalized,
          },
        );
      }
    };

    const push = (line: Omit<CheckoutChargeLine, 'position'>) => {
      lines.push({ ...line, position: position++ });
    };

    for (const order of [...check.shopOrders].sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      if (order.status === 'CANCELED') continue;
      assertCurrency('SHOP_ORDER', order.id, order.currency);

      const orderLineAmounts: Prisma.Decimal[] = [];
      for (const item of [...order.lines]
        .filter((line) => line.lineStatus === 'ACTIVE')
        .sort((a, b) => a.id.localeCompare(b.id))) {
        const gross = roundMoneyDecimal(
          lineTotalDecimal(item.quantity, item.unitPrice),
          2,
        );
        orderLineAmounts.push(gross);
        push({
          sourceType: 'SHOP_ORDER',
          sourceId: order.id,
          lineReference: item.id,
          description: item.name,
          quantity: item.quantity,
          unitAmount: toPrismaDecimal(item.unitPrice),
          grossAmount: gross,
          discountAmount: new Prisma.Decimal(0),
          finalAmount: gross,
          currency,
          pricingMetadata: {
            sourceStatus: order.status,
            orderLabel: order.label,
            calculation: 'legacy_order_line_round_2dp',
          } as Prisma.InputJsonObject,
        });
      }

      if (order.tableReserved && !isMoneyZero(order.reservationFee)) {
        const fee = roundMoneyDecimal(order.reservationFee, 2);
        orderLineAmounts.push(fee);
        push({
          sourceType: 'SHOP_ORDER',
          sourceId: order.id,
          lineReference: 'reservation-fee',
          description: 'Table reservation fee',
          quantity: 1,
          unitAmount: fee,
          grossAmount: fee,
          discountAmount: new Prisma.Decimal(0),
          finalAmount: fee,
          currency,
          pricingMetadata: {
            sourceStatus: order.status,
            embeddedInOrderTotal: true,
          } as Prisma.InputJsonObject,
        });
      }

      const derived = sumMoneyDecimal(...orderLineAmounts);
      const stored = toPrismaDecimal(order.total);
      const reconciliation = stored.sub(derived);
      if (!reconciliation.isZero()) {
        push({
          sourceType: 'SHOP_ORDER',
          sourceId: order.id,
          lineReference: 'legacy-total-reconciliation',
          description: 'Legacy order total reconciliation',
          quantity: 1,
          unitAmount: reconciliation,
          grossAmount: reconciliation,
          discountAmount: new Prisma.Decimal(0),
          finalAmount: reconciliation,
          currency,
          pricingMetadata: {
            reason: 'preserve_stored_shop_order_total',
            storedTotal: serializeMoney(stored),
            derivedTotal: serializeMoney(derived),
          } as Prisma.InputJsonObject,
        });
      }
    }

    for (const session of [...check.playSessions].sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      if (session.status === 'CANCELED' || session.reservationId) continue;
      assertCurrency('PLAY_SESSION', session.id, session.currency);
      const gross = toPrismaDecimal(session.amount);
      const isPaid = session.status === 'COMPLETED' || session.completedAt != null;
      const discounted = isPaid
        ? { finalAmount: gross, discountAmount: new Prisma.Decimal(0) }
        : discountedAmount(gross, session.billingDiscountPercent);
      push({
        sourceType: 'PLAY_SESSION',
        sourceId: session.id,
        lineReference: session.id,
        description: session.label?.trim() || 'Walk-in play session',
        quantity: 1,
        unitAmount: gross,
        grossAmount: gross,
        discountAmount: discounted.discountAmount,
        finalAmount: discounted.finalAmount,
        currency,
        pricingMetadata: {
          sourceStatus: session.status,
          discountPercent: clampDiscountPercent(session.billingDiscountPercent),
          amountAlreadyFinal: isPaid,
          reservationLinked: false,
        } as Prisma.InputJsonObject,
      });
    }

    for (const reservation of [...check.reservations].sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      if (reservation.status === 'CANCELED' || reservation.status === 'NO_SHOW') {
        continue;
      }
      assertCurrency('RESERVATION', reservation.id, reservation.currency);

      const mapped = this.playBilling.mapPlayBillingRow(reservation, now);
      if (!mapped) {
        push({
          sourceType: 'RESERVATION',
          sourceId: reservation.id,
          lineReference: reservation.id,
          description: reservation.guestName?.trim() || 'Reservation',
          quantity: 1,
          unitAmount: new Prisma.Decimal(0),
          grossAmount: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          finalAmount: new Prisma.Decimal(0),
          currency,
          pricingMetadata: {
            sourceStatus: reservation.status,
            calculation: 'non_play_reservation_no_existing_charge',
          } as Prisma.InputJsonObject,
        });
        continue;
      }

      const gross = toPrismaDecimal(mapped.baseAmount);
      const finalAmount = toPrismaDecimal(mapped.amountDue);
      const discountAmount = gross.greaterThan(finalAmount)
        ? gross.sub(finalAmount)
        : new Prisma.Decimal(0);
      push({
        sourceType: 'RESERVATION',
        sourceId: reservation.id,
        lineReference: reservation.id,
        description: reservation.guestName?.trim() || 'Reservation',
        quantity: 1,
        unitAmount: gross,
        grossAmount: gross,
        discountAmount,
        finalAmount,
        currency,
        pricingMetadata: {
          sourceStatus: reservation.status,
          discountPercent: mapped.discountPercent,
          billedAt: mapped.billedAt,
          resourceLinked: true,
          rateLabel: mapped.rateLabel,
          breakdown: mapped.breakdown,
          computedAmount: mapped.computedAmount,
          calculation: mapped.isPaid
            ? 'stored_billed_amount'
            : 'existing_play_billing_pricing',
        } as Prisma.InputJsonObject,
      });
    }

    const subtotal = sumMoneyDecimal(...lines.map((line) => line.finalAmount));
    const adjustments = new Prisma.Decimal(0);
    const taxAmount = new Prisma.Decimal(0);
    const depositAmount = new Prisma.Decimal(0);
    const total = subtotal.add(adjustments).add(taxAmount).sub(depositAmount);
    const amountDue = total;

    const hashPayload = {
      checkId: check.id,
      currency,
      lines: lines.map(stableLine),
    };
    const sourceHash = createHash('sha256')
      .update(JSON.stringify(hashPayload))
      .digest('hex');

    return {
      checkId: check.id,
      checkVersion: check.version,
      sourceHash,
      currency,
      subtotal,
      adjustments,
      taxAmount,
      depositAmount,
      total,
      amountDue,
      lines,
    };
  }

  serialize(preview: CheckoutPreview) {
    return {
      checkId: preview.checkId,
      checkVersion: preview.checkVersion,
      sourceHash: preview.sourceHash,
      currency: preview.currency,
      subtotal: serializeMoney(preview.subtotal),
      adjustments: serializeMoney(preview.adjustments),
      taxAmount: serializeMoney(preview.taxAmount),
      depositAmount: serializeMoney(preview.depositAmount),
      total: serializeMoney(preview.total),
      amountDue: serializeMoney(preview.amountDue),
      lines: preview.lines.map((line) => stableLine(line)),
    };
  }
}
