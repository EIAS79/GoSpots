import { api } from "./api";
import type { ShopRole } from "./auth-client";

export type StaffMember = {
  membershipId: string;
  userId: string;
  loginId: string;
  username: string | null;
  name: string | null;
  role: ShopRole;
  permissions: string;
  isActive: boolean;
  activated: boolean;
  pendingInvite: boolean;
  passwordResetRequestedAt: string | null;
  createdAt: string;
};

export type StaffListResponse = {
  seats: { used: number; limit: number; purchased?: number; tier: string };
  canCreateEmployees: boolean;
  canEditStaff: boolean;
  loginSuffix: string;
  venueSlug: string;
  seatPolicy: string;
  staff: StaffMember[];
  assignablePermissions: string[];
};

export type CreateStaffResponse = StaffMember & {
  activationUrl: string;
  activationExpiresAt: string;
};

export function fetchStaff() {
  return api<StaffListResponse>("/staff");
}

export function createStaff(body: {
  username: string;
  name?: string;
  role?: ShopRole;
  permissions?: string[];
}) {
  return api<CreateStaffResponse>("/staff", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function regenerateStaffInvite(membershipId: string) {
  return api<{
    membershipId: string;
    loginId: string;
    activationUrl: string;
    activationExpiresAt: string;
  }>(`/staff/${membershipId}/regenerate-invite`, { method: "POST" });
}

export function updateStaff(
  membershipId: string,
  body: {
    name?: string;
    role?: ShopRole;
    permissions?: string[];
    isActive?: boolean;
  },
) {
  return api<StaffMember>(`/staff/${membershipId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteStaff(membershipId: string) {
  return api<{ ok: boolean }>(`/staff/${membershipId}`, { method: "DELETE" });
}

export function activateStaffAccount(token: string, password: string) {
  return api<{
    user: { id: string; email: string; name: string | null; systemRole: string };
    venuePath: string | null;
  }>("/auth/staff/activate", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}
