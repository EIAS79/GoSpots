import { ApiError, api, credentialedFetch } from "./api";

export type AuditEntry = {
  id: string;
  shopId: string | null;
  userId: string | null;
  section: string;
  action: string;
  summary: string;
  meta: string | null;
  metaParsed: unknown;
  actorRole: string | null;
  actorName: string | null;
  actorEmail: string | null;
  ipAddress: string | null;
  createdAt: string;
};

export type AuditListParams = {
  from?: string;
  to?: string;
  section?: string;
  action?: string;
  search?: string;
  take?: number;
  skip?: number;
};

export type AuditListResponse = {
  items: AuditEntry[];
  total: number;
  take: number;
  skip: number;
  canDelete: boolean;
};

function toQuery(params: AuditListParams) {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.section && params.section !== "all") q.set("section", params.section);
  if (params.action && params.action !== "all") q.set("action", params.action);
  if (params.search) q.set("search", params.search);
  if (params.take != null) q.set("take", String(params.take));
  if (params.skip != null) q.set("skip", String(params.skip));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function fetchAuditLog(params: AuditListParams = {}) {
  return api<AuditListResponse>(`/audit${toQuery(params)}`);
}

export function deleteAuditEntry(id: string) {
  return api<{ ok: boolean }>(`/audit/${id}`, { method: "DELETE" });
}

export function deleteAuditEntries(body: {
  ids?: string[];
  allMatching?: boolean;
  from?: string;
  to?: string;
  section?: string;
  action?: string;
  search?: string;
}) {
  return api<{ deleted: number }>("/audit", {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

export async function downloadAuditCsv(params: AuditListParams = {}) {
  const res = await credentialedFetch(`/audit/export${toQuery(params)}`);
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    const message =
      (body as { message?: string })?.message ?? `Export failed: ${res.status}`;
    throw new ApiError(String(message), res.status, body);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `GoSpots-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
