export const PHASE15_SAFE_ACTION_TYPES = [
  'NOTIFICATION',
  'TASK',
  'ATTENTION',
  'EMAIL',
  'SMS',
  'CUSTOMER_TAG',
  'REPORT',
] as const;

export const PHASE15_FORBIDDEN_AUTONOMOUS_ACTIONS = [
  'REFUND',
  'PRICE_UPDATE',
  'CASH_ADJUST',
  'STORED_VALUE_ADJUST',
  'INVENTORY_CORRECTION',
  'PERMISSION_CHANGE',
] as const;

export type Phase15AutomationTemplate = {
  key: string;
  name: string;
  triggerType: 'DOMAIN_EVENT' | 'SCHEDULED';
  triggerHint: string;
  defaultActionType: (typeof PHASE15_SAFE_ACTION_TYPES)[number];
  description: string;
};

export const PHASE15_AUTOMATION_TEMPLATES: readonly Phase15AutomationTemplate[] = [
  { key: 'reservation-reminder', name: 'Reservation reminder', triggerType: 'SCHEDULED', triggerHint: 'reservation arriving soon', defaultActionType: 'NOTIFICATION', description: 'Remind staff or the guest about an upcoming reservation.' },
  { key: 'no-show-follow-up', name: 'No-show follow-up', triggerType: 'DOMAIN_EVENT', triggerHint: 'reservation.no_show', defaultActionType: 'TASK', description: 'Create a follow-up task after a reservation becomes a no-show.' },
  { key: 'low-stock-alert', name: 'Low-stock alert', triggerType: 'DOMAIN_EVENT', triggerHint: 'inventory.low', defaultActionType: 'ATTENTION', description: 'Create an attention item when inventory falls below policy.' },
  { key: 'long-running-session-alert', name: 'Long-running session alert', triggerType: 'SCHEDULED', triggerHint: 'session elapsed threshold', defaultActionType: 'ATTENTION', description: 'Surface sessions that exceed a configured duration.' },
  { key: 'open-tab-day-close-warning', name: 'Open-tab day-close warning', triggerType: 'SCHEDULED', triggerHint: 'business-day close', defaultActionType: 'ATTENTION', description: 'Warn operators about open GuestChecks before day close.' },
  { key: 'cash-variance-notification', name: 'Cash variance notification', triggerType: 'DOMAIN_EVENT', triggerHint: 'cash.variance', defaultActionType: 'NOTIFICATION', description: 'Notify owners or managers when a cash variance is recorded.' },
  { key: 'failed-fiscal-ksef-alert', name: 'Failed fiscal/KSeF alert', triggerType: 'DOMAIN_EVENT', triggerHint: 'fiscal.failed or ksef.failed', defaultActionType: 'ATTENTION', description: 'Surface fiscal or KSeF failures without changing the financial fact.' },
  { key: 'unresolved-payment-alert', name: 'Unresolved payment alert', triggerType: 'DOMAIN_EVENT', triggerHint: 'payment.unknown', defaultActionType: 'ATTENTION', description: 'Surface UNKNOWN or otherwise unresolved payment outcomes for reconciliation.' },
  { key: 'daily-owner-summary', name: 'Daily owner summary', triggerType: 'SCHEDULED', triggerHint: 'daily business-day summary', defaultActionType: 'REPORT', description: 'Produce a deterministic owner summary from canonical payload facts.' },
  { key: 'device-offline-alert', name: 'Device offline alert', triggerType: 'DOMAIN_EVENT', triggerHint: 'device.offline', defaultActionType: 'NOTIFICATION', description: 'Notify operators when a registered venue device becomes unavailable.' },
  { key: 'membership-expiry-reminder', name: 'Membership expiry reminder', triggerType: 'SCHEDULED', triggerHint: 'membership expiry window', defaultActionType: 'NOTIFICATION', description: 'Remind staff or customers about an approaching membership expiry.' },
] as const;
