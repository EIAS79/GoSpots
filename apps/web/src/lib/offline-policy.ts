export type OfflineCapability =
  | "cached_read"
  | "check_create"
  | "check_update"
  | "order_add"
  | "gaming_session_start"
  | "gaming_session_end"
  | "card_payment"
  | "fiscal_receipt"
  | "ksef_submit"
  | "refund"
  | "subscription_billing"
  | "financial_reconciliation";

export type OfflinePolicyDecision = {
  allowed: boolean;
  reason: string;
};

const POLICY: Record<OfflineCapability, OfflinePolicyDecision> = {
  cached_read: { allowed: true, reason: "Available from the local venue cache." },
  check_create: { allowed: true, reason: "Queued locally and replayed with a stable operation ID." },
  check_update: { allowed: true, reason: "Queued with the check version captured before WAN loss." },
  order_add: {
    allowed: false,
    reason: "Offline order mutation is not enabled in Offline Lite until stock/conflict replay is authoritative.",
  },
  gaming_session_start: {
    allowed: false,
    reason: "Offline gaming mutation is reserved for a later approved conflict policy.",
  },
  gaming_session_end: {
    allowed: false,
    reason: "Offline gaming mutation is reserved for a later approved conflict policy.",
  },
  card_payment: { allowed: false, reason: "Card authorization requires an online payment provider." },
  fiscal_receipt: { allowed: false, reason: "Fiscal-device completion must not be guessed while offline." },
  ksef_submit: { allowed: false, reason: "KSeF submission requires online provider reconciliation." },
  refund: { allowed: false, reason: "Cloud/provider refunds are online-only." },
  subscription_billing: { allowed: false, reason: "GoSpots subscription billing is cloud-only." },
  financial_reconciliation: { allowed: false, reason: "Final financial reconciliation is cloud-authoritative." },
};

export function offlinePolicy(capability: OfflineCapability): OfflinePolicyDecision {
  return POLICY[capability];
}

export function assertOfflineAllowed(capability: OfflineCapability): void {
  const decision = offlinePolicy(capability);
  if (!decision.allowed) throw new Error(decision.reason);
}
