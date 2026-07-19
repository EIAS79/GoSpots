import { api } from "./api";

export type SystemRole = "USER" | "SUPER_ADMIN";
export type ShopRole = "OWNER" | "MANAGER" | "STAFF";
export type SubscriptionTier =
  | "FREE"
  | "STARTER"
  | "STANDARD"
  | "PRO"
  | "ENTERPRISE";

export type UserAccountType = "VENUE_OWNER" | "VENUE_STAFF";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  accountType?: UserAccountType;
  staffHandle?: string | null;
  systemRole: SystemRole;
  emailVerified: boolean;
  memberships: {
    id: string;
    role: ShopRole;
    permissions: string;
    isActive?: boolean;
    shop: {
      id: string;
      slug: string;
      dashboardKey: string;
      name: string;
      subscription: {
        tier: SubscriptionTier;
        status: string;
        trialEndsAt: string | null;
        packId?: string | null;
        addOns?: string | null;
      } | null;
    };
  }[];
}

export type AuthSessionResponse = {
  user: Pick<AuthUser, "id" | "email" | "name" | "systemRole">;
  dashboardPath: string | null;
};

export function login(
  login: string,
  password: string,
  accountType?: UserAccountType,
) {
  return api<AuthSessionResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ login, password, accountType }),
  });
}

export function requestOwnerPasswordReset(email: string) {
  return api<{ ok: boolean; message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function requestStaffPasswordReset(venueName: string, loginId: string) {
  return api<{ ok: boolean; message: string }>("/auth/staff/forgot-password", {
    method: "POST",
    body: JSON.stringify({ venueName, loginId }),
  });
}

export function resetOwnerPassword(token: string, password: string) {
  return api<{ ok: boolean }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export function register(input: {
  email: string;
  password: string;
  name?: string;
  shopSlug?: string;
  shopName?: string;
  packId?: string;
  addOns?: string[];
  venueType?: string;
  city?: string;
  country?: string;
  phone?: string;
}) {
  return api<AuthSessionResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logout() {
  return api<void>("/auth/logout", { method: "POST" });
}

export function refresh() {
  return api("/auth/refresh", { method: "POST" });
}

export function fetchMe() {
  return api<AuthUser & { dashboardPath: string | null }>("/auth/me", {
    method: "GET",
  });
}

export function createVenue(input: { shopName: string; shopSlug: string }) {
  return api<{
    dashboardPath: string;
    shop: { id: string; slug: string; name: string; dashboardKey: string };
  }>("/auth/venues", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type LinkableVenue = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
};

export function previewLinkVenues(email: string, password: string) {
  return api<{
    email: string;
    sameAccount: boolean;
    venues: LinkableVenue[];
    message?: string;
  }>("/auth/venues/link/preview", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function linkVenues(input: {
  email: string;
  password: string;
  shopIds: string[];
}) {
  return api<{
    linked: { id: string; name: string; dashboardPath: string }[];
    dashboardPath: string | null;
  }>("/auth/venues/link", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function hasPermission(perms: string, key: string) {
  const set = new Set(perms.split(",").map((s) => s.trim()).filter(Boolean));
  return set.has("*") || set.has(key);
}
