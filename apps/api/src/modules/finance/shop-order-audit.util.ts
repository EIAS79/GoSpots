import {
  toMoneyNumber,
  type MoneyInput,
} from '../../common/money.util';

type OrderLineForAudit = {
  name: string;
  quantity: number;
  unitPrice: MoneyInput;
  lineStatus: string;
};

export type ShopOrderForAudit = {
  id: string;
  label: string | null;
  note: string | null;
  status: string;
  paymentMethod: string;
  guestCount: number;
  total: MoneyInput;
  lines?: OrderLineForAudit[];
};

function shortRef(id: string) {
  return id.slice(-8).toUpperCase();
}

export function orderTicketLabel(order: ShopOrderForAudit) {
  const custom = order.label?.trim();
  if (custom) return custom;
  return `Ticket #${shortRef(order.id)}`;
}

export function orderStatusLabel(status: string) {
  switch (status) {
    case 'PENDING':
      return 'Preparing';
    case 'COMPLETED':
      return 'Handed off';
    case 'CANCELED':
      return 'Canceled';
    default:
      return status;
  }
}

function guestPhrase(count: number) {
  return count === 1 ? '1 guest' : `${count} guests`;
}

function linesPhrase(lines: OrderLineForAudit[] | undefined) {
  const active = (lines ?? []).filter((l) => l.lineStatus === 'ACTIVE');
  if (active.length === 0) return 'no items yet';
  const parts = active.map((l) => `${l.quantity}× ${l.name}`);
  if (parts.length <= 4) return parts.join(', ');
  return `${parts.slice(0, 4).join(', ')} (+${parts.length - 4} more)`;
}

function moneyLabel(value: MoneyInput) {
  return toMoneyNumber(value).toFixed(2);
}

export function shopOrderAuditMeta(
  order: ShopOrderForAudit,
  extra?: Record<string, unknown>,
) {
  const activeLines = (order.lines ?? [])
    .filter((l) => l.lineStatus === 'ACTIVE')
    .map((l) => {
      const unitPrice = toMoneyNumber(l.unitPrice);
      return {
        name: l.name,
        quantity: l.quantity,
        unitPrice,
        subtotal: Math.round(l.quantity * unitPrice * 100) / 100,
      };
    });

  const total = toMoneyNumber(order.total);
  return {
    orderId: order.id,
    ticket: orderTicketLabel(order),
    label: order.label,
    note: order.note,
    status: order.status,
    statusLabel: orderStatusLabel(order.status),
    paymentMethod: order.paymentMethod,
    guestCount: order.guestCount,
    total: Math.round(total * 100) / 100,
    lineCount: order.lines?.length ?? 0,
    itemsSummary: linesPhrase(order.lines),
    activeLines,
    ...extra,
  };
}

export function auditSummaryCreate(order: ShopOrderForAudit) {
  return `New menu order — ${orderTicketLabel(order)} · ${guestPhrase(order.guestCount)} · ${order.paymentMethod}`;
}

export function auditSummaryUpdate(order: ShopOrderForAudit, change: string) {
  return `${change} — ${orderTicketLabel(order)} · ${orderStatusLabel(order.status)} · ${moneyLabel(order.total)} · ${linesPhrase(order.lines)}`;
}

export function auditSummaryAddLine(
  order: ShopOrderForAudit,
  line: { name: string; quantity: number },
) {
  return `Added ${line.quantity}× ${line.name} to ${orderTicketLabel(order)} (total ${moneyLabel(order.total)})`;
}

export function auditSummaryDelete(order: ShopOrderForAudit) {
  return `Permanently deleted ${orderTicketLabel(order)} · ${moneyLabel(order.total)} · ${linesPhrase(order.lines)}`;
}

export function auditSummaryPatchLine(
  order: ShopOrderForAudit,
  line: { name: string; quantity: number },
  change: string,
) {
  return `${change} — ${line.quantity}× ${line.name} on ${orderTicketLabel(order)} (total ${moneyLabel(order.total)})`;
}

export function auditSummaryRemoveLine(
  order: ShopOrderForAudit,
  line: { name: string; quantity: number },
) {
  return `Removed ${line.quantity}× ${line.name} from ${orderTicketLabel(order)} (total ${moneyLabel(order.total)})`;
}
