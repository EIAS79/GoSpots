export type OfflineCapability =
  | "cached_read"
  | "check_create"
  | "check_update"
  | "order_add"
  | "gaming_session_start"
  | "gaming_session_end"
  | "cash_payment"
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
    allowed: true,
    reason: "Queued locally; menu references are validated and prices are recalculated authoritatively by the server during replay.",
  },
  gaming_session_start: {
    allowed: true,
    reason: "Queued with a stable session ID and local start time; replay re-checks resource conflicts before commit.",
  },
  gaming_session_end: {
    allowed: true,
    reason: "Queued with the captured session version and local end time; replay rejects stale versions deterministically.",
  },
  cash_payment: {
    allowed: false,
    reason: "Offline Lite does not finalize cash settlement because fiscal and drawer policy remain cloud-authoritative; Edge/local-compliance mode may add this separately.",
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
