import type { AuthUser } from "./auth-client";
import { offlineLiteEnabledFor } from "./offline-entitlement";

const SNAPSHOT_KEY = "gospots-offline-auth-v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Snapshot = {
  savedAt: number;
  user: AuthUser;
};

function minimalUser(user: AuthUser): AuthUser {
  return {
    id: user.id,
    email: "",
    name: user.name,
    accountType: user.accountType,
    staffHandle: user.staffHandle ?? null,
    systemRole: user.systemRole,
    emailVerified: user.emailVerified,
    memberships: user.memberships.map((membership) => ({
      id: membership.id,
      role: membership.role,
      permissions: membership.permissions,
      isActive: membership.isActive,
      shop: {
        id: membership.shop.id,
        slug: membership.shop.slug,
        name: membership.shop.name,
        subscription: membership.shop.subscription
          ? {
              tier: membership.shop.subscription.tier,
              status: membership.shop.subscription.status,
              trialEndsAt: membership.shop.subscription.trialEndsAt,
              packId: membership.shop.subscription.packId,
              addOns: membership.shop.subscription.addOns,
              addOnRows: membership.shop.subscription.addOnRows,
            }
          : null,
      },
    })),
  };
}

export function saveOfflineAuthSnapshot(user: AuthUser): void {
  if (typeof localStorage === "undefined") return;
  const snapshot: Snapshot = { savedAt: Date.now(), user: minimalUser(user) };
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function readOfflineAuthSnapshot(): AuthUser | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    if (
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > MAX_AGE_MS ||
      !parsed.user ||
      typeof parsed.user.id !== "string" ||
      !Array.isArray(parsed.user.memberships)
    ) {
      localStorage.removeItem(SNAPSHOT_KEY);
      return null;
    }
    const entitled = parsed.user.memberships.some((membership) =>
      offlineLiteEnabledFor({
        userId: parsed.user!.id,
        shopId: membership.shop.id,
      }),
    );
    return entitled ? parsed.user : null;
  } catch {
    localStorage.removeItem(SNAPSHOT_KEY);
    return null;
  }
}

export function purgeOfflineAuthSnapshot(): void {
  if (typeof localStorage !== "undefined") localStorage.removeItem(SNAPSHOT_KEY);
}
