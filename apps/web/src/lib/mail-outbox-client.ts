import { api, ApiError } from "./api";

/** Sanitized dead-letter row from `GET /mail/outbox/dead` (no html/text bodies). */
export type MailOutboxDeadLetterRow = {
  id: string;
  shopId: string | null;
  status: "PENDING" | "SENT" | "FAILED" | "DEAD" | "SKIPPED";
  attempts: number;
  lastError: string | null;
  to: string | null;
  subject: string | null;
  required: boolean;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
};

export type MailOutboxStatusCounts = {
  PENDING: number;
  SENT: number;
  FAILED: number;
  DEAD: number;
  SKIPPED: number;
};

export type MailOutboxDeadListResponse = {
  counts: MailOutboxStatusCounts;
  total: number;
  items: MailOutboxDeadLetterRow[];
  meta?: { note?: string };
};

export type MailOutboxRetryResponse = {
  item: MailOutboxDeadLetterRow;
  meta?: { note?: string };
};

export type FetchMailOutboxDeadOptions = {
  includeFailed?: boolean;
  take?: number;
  skip?: number;
};

export function fetchMailOutboxDead(opts: FetchMailOutboxDeadOptions = {}) {
  const params = new URLSearchParams();
  if (opts.includeFailed) params.set("includeFailed", "1");
  if (opts.take != null) params.set("take", String(opts.take));
  if (opts.skip != null) params.set("skip", String(opts.skip));
  const qs = params.toString();
  return api<MailOutboxDeadListResponse>(
    `/mail/outbox/dead${qs ? `?${qs}` : ""}`,
  );
}

/** SUPER_ADMIN: platform mail rows with null shopId. */
export function fetchSystemMailOutboxDead(
  opts: FetchMailOutboxDeadOptions = {},
) {
  const params = new URLSearchParams();
  if (opts.includeFailed) params.set("includeFailed", "1");
  if (opts.take != null) params.set("take", String(opts.take));
  if (opts.skip != null) params.set("skip", String(opts.skip));
  const qs = params.toString();
  return api<MailOutboxDeadListResponse>(
    `/mail/outbox/system/dead${qs ? `?${qs}` : ""}`,
  );
}

/** Requeue one DEAD row → PENDING (attempts=0). */
export function retryMailOutboxDead(id: string) {
  return api<MailOutboxRetryResponse>(
    `/mail/outbox/${encodeURIComponent(id)}/retry`,
    { method: "POST" },
  );
}

/** SUPER_ADMIN: requeue system (null shopId) DEAD row. */
export function retrySystemMailOutboxDead(id: string) {
  return api<MailOutboxRetryResponse>(
    `/mail/outbox/system/${encodeURIComponent(id)}/retry`,
    { method: "POST" },
  );
}

export function mailOutboxErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Could not update mail outbox.";
}
