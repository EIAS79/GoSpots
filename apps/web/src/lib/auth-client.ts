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
      name: string;
      subscription: {
        tier: SubscriptionTier;
        status: string;
        trialEndsAt: string | null;
        packId?: string | null;
        /** Effective CSV from /me (dual-read); may also be a string[] from other APIs */
        addOns?: string | string[] | null;
        addOnRows?: { addOnId: string }[] | null;
      } | null;
    };
  }[];
}

export type AuthSessionResponse = {
  user: Pick<AuthUser, "id" | "email" | "name" | "systemRole">;
  /** Public venue slug for dashboard redirects (never `slug--key`). */
  venuePath: string | null;
};

export type MfaLoginChallengeResponse = {
  mfaRequired: true;
  mfaToken: string;
};

export type LoginResponse = AuthSessionResponse | MfaLoginChallengeResponse;

export function login(
  login: string,
  password: string,
  accountType?: UserAccountType,
) {
  return api<LoginResponse>("/auth/login", {
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
  return api<AuthUser & { venuePath: string | null }>("/auth/me", {
    method: "GET",
  });
}

export function createVenue(input: {
  shopName: string;
  shopSlug: string;
  /** Explicit empty = CORE only until Subscription save. */
  addOns?: string[];
}) {
  return api<{
    venuePath: string;
    shop: { id: string; slug: string; name: string };
  }>("/auth/venues", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      addOns: input.addOns ?? [],
    }),
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
    linked: { id: string; name: string; venuePath: string }[];
    venuePath: string | null;
  }>("/auth/venues/link", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function hasPermission(perms: string, key: string) {
  const set = new Set(perms.split(",").map((s) => s.trim()).filter(Boolean));
  return set.has("*") || set.has(key);
}
