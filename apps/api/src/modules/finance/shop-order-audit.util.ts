type OrderLineForAudit = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineStatus: string;
};

export type ShopOrderForAudit = {
  id: string;
  label: string | null;
  note: string | null;
  status: string;
  paymentMethod: string;
  guestCount: number;
  total: number;
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
    case "PENDING":
      return "Preparing";
    case "COMPLETED":
      return "Handed off";
    case "CANCELED":
      return "Canceled";
    default:
      return status;
  }
}

function guestPhrase(count: number) {
  return count === 1 ? "1 guest" : `${count} guests`;
}

function linesPhrase(lines: OrderLineForAudit[] | undefined) {
  const active = (lines ?? []).filter((l) => l.lineStatus === "ACTIVE");
  if (active.length === 0) return "no items yet";
  const parts = active.map((l) => `${l.quantity}× ${l.name}`);
  if (parts.length <= 4) return parts.join(", ");
  return `${parts.slice(0, 4).join(", ")} (+${parts.length - 4} more)`;
}

export function shopOrderAuditMeta(
  order: ShopOrderForAudit,
  extra?: Record<string, unknown>,
) {
  const activeLines = (order.lines ?? [])
    .filter((l) => l.lineStatus === "ACTIVE")
    .map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      subtotal: Math.round(l.quantity * l.unitPrice * 100) / 100,
    }));

  return {
    orderId: order.id,
    ticket: orderTicketLabel(order),
    label: order.label,
    note: order.note,
    status: order.status,
    statusLabel: orderStatusLabel(order.status),
    paymentMethod: order.paymentMethod,
    guestCount: order.guestCount,
    total: Math.round(order.total * 100) / 100,
    lineCount: order.lines?.length ?? 0,
    itemsSummary: linesPhrase(order.lines),
    activeLines,
    ...extra,
  };
}

export function auditSummaryCreate(order: ShopOrderForAudit) {
  return `New menu order — ${orderTicketLabel(order)} · ${guestPhrase(order.guestCount)} · ${order.paymentMethod}`;
}

export function auditSummaryUpdate(
  order: ShopOrderForAudit,
  change: string,
) {
  return `${change} — ${orderTicketLabel(order)} · ${orderStatusLabel(order.status)} · ${order.total.toFixed(2)} · ${linesPhrase(order.lines)}`;
}

export function auditSummaryAddLine(
  order: ShopOrderForAudit,
  line: { name: string; quantity: number },
) {
  return `Added ${line.quantity}× ${line.name} to ${orderTicketLabel(order)} (total ${order.total.toFixed(2)})`;
}

export function auditSummaryDelete(order: ShopOrderForAudit) {
  return `Permanently deleted ${orderTicketLabel(order)} · ${order.total.toFixed(2)} · ${linesPhrase(order.lines)}`;
}
