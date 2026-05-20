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
      } | null;
    };
  }[];
}

export type AuthSessionResponse = {
  user: Pick<AuthUser, "id" | "email" | "name" | "systemRole">;
  dashboardPath: string | null;
};

export function login(login: string, password: string) {
  return api<AuthSessionResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ login, password }),
  });
}

export function register(input: {
  email: string;
  password: string;
  name?: string;
  shopSlug?: string;
  shopName?: string;
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

export function hasPermission(perms: string, key: string) {
  const set = new Set(perms.split(",").map((s) => s.trim()).filter(Boolean));
  return set.has("*") || set.has(key);
}
