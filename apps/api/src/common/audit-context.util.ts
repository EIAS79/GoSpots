export type AuditActorContext = {
  id?: string;
  role?: string;
  name?: string;
  email?: string;
};

export type AuditTargetContext = {
  type: string;
  id?: string;
};

export type AuditApprovalContext = {
  requestId?: string;
  approverId?: string;
};

export type AuditContext = {
  actor: AuditActorContext;
  shopId: string;
  deviceId?: string;
  correlationId: string;
  action: string;
  target: AuditTargetContext;
  before?: unknown;
  after?: unknown;
  reason?: string;
  approval?: AuditApprovalContext;
};

/**
 * Normalized metadata shape for sensitive business mutations.
 * Values should already be redacted; callers must not include secrets/provider payloads.
 */
export function buildAuditContext(input: AuditContext): AuditContext {
  if (!input.shopId?.trim()) throw new TypeError('Audit shopId is required');
  if (!input.correlationId?.trim()) {
    throw new TypeError('Audit correlationId is required');
  }
  if (!input.action?.trim()) throw new TypeError('Audit action is required');
  if (!input.target?.type?.trim()) {
    throw new TypeError('Audit target type is required');
  }

  return {
    actor: { ...input.actor },
    shopId: input.shopId,
    deviceId: input.deviceId,
    correlationId: input.correlationId,
    action: input.action,
    target: { ...input.target },
    before: input.before,
    after: input.after,
    reason: input.reason,
    approval: input.approval ? { ...input.approval } : undefined,
  };
}

export function serializeAuditContext(input: AuditContext): string {
  return JSON.stringify(buildAuditContext(input));
}
