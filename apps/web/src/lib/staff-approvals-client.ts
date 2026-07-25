import { api } from "./api";

export type StaffActionKind =
  | "MENU_ITEM_UPDATE"
  | "RESOURCE_UNIT_UPDATE"
  | "RESOURCE_CATEGORY_UPDATE";

export type StaffActionRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

export type StaffActionPatch = {
  name?: string;
  description?: string | null;
  price?: number;
  hourlyRate?: number;
  isAvailable?: boolean;
  rates?: { label: string; durationMinutes?: number; price: number; sortOrder?: number }[];
};

export type StaffActionRequest = {
  id: string;
  kind: StaffActionKind;
  targetId: string;
  targetLabel: string;
  patch: StaffActionPatch;
  requiredPermission: string;
  status: StaffActionRequestStatus;
  note: string | null;
  resolveNote: string | null;
  expiresAt: string;
  resolvedAt: string | null;
  createdAt: string;
  requester: { id: string; name: string | null; email: string };
  approver: { id: string; name: string | null; email: string } | null;
};

export function listStaffApprovals(status?: StaffActionRequestStatus) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return api<{ items: StaffActionRequest[]; pendingCount: number }>(
    `/staff-approvals${q}`,
  );
}

export function createStaffApprovalRequest(body: {
  kind: StaffActionKind;
  targetId: string;
  patch: StaffActionPatch;
  note?: string;
}) {
  return api<StaffActionRequest>("/staff-approvals", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function approveStaffRequest(
  id: string,
  body: { password: string; resolveNote?: string },
) {
  return api<StaffActionRequest>(`/staff-approvals/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function approveStaffRequestWithManager(
  id: string,
  body: {
    managerEmail: string;
    managerPassword: string;
    resolveNote?: string;
  },
) {
  return api<StaffActionRequest>(`/staff-approvals/${id}/approve-with-manager`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function rejectStaffRequest(
  id: string,
  body: { password: string; resolveNote?: string },
) {
  return api<StaffActionRequest>(`/staff-approvals/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function cancelStaffRequest(id: string) {
  return api<StaffActionRequest>(`/staff-approvals/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
