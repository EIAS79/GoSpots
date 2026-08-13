"use client";

import { useEffect } from "react";
import {
  purgeOfflineLiteEntitlement,
  refreshOfflineLiteEntitlement,
} from "@/lib/offline-entitlement";
import {
  configureOfflineContext,
  purgeOfflineNamespace,
  type OfflineNamespace,
} from "@/lib/offline-outbox";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useConnectivityOptional } from "@/lib/connectivity-context";

const ACTIVE_NAMESPACE_KEY = "gospots-offline-active-namespace";

function sameNamespace(a: OfflineNamespace | null, b: OfflineNamespace | null) {
  return a?.userId === b?.userId && a?.shopId === b?.shopId;
}

function readPreviousNamespace(): OfflineNamespace | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(ACTIVE_NAMESPACE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OfflineNamespace>;
    return typeof parsed.userId === "string" && typeof parsed.shopId === "string"
      ? { userId: parsed.userId, shopId: parsed.shopId }
      : null;
  } catch {
    localStorage.removeItem(ACTIVE_NAMESPACE_KEY);
    return null;
  }
}

function rememberNamespace(value: OfflineNamespace | null) {
  if (typeof localStorage === "undefined") return;
  if (value) localStorage.setItem(ACTIVE_NAMESPACE_KEY, JSON.stringify(value));
  else localStorage.removeItem(ACTIVE_NAMESPACE_KEY);
}

export function OfflineContextBridge() {
  const { state } = useAuth();
  const membership = useCurrentMembership();
  const connectivity = useConnectivityOptional();
  const browserOnline = connectivity?.browserOnline;
  const refreshOfflineCounts = connectivity?.refreshOfflineCounts;

  useEffect(() => {
    const previous = readPreviousNamespace();

    // A hard refresh always starts AuthProvider in `loading`. While offline,
    // that state can last until the cached auth snapshot is restored. Treating
    // it as a confirmed logout would purge the IndexedDB namespace containing
    // unsynced operations. Rehydrate the last namespace for that transient
    // window and defer any destructive transition until auth is resolved.
    if (state.status === "loading") {
      configureOfflineContext(previous);
      void refreshOfflineCounts?.();
      return;
    }

    const next: OfflineNamespace | null =
      state.status === "authed" && membership
        ? { userId: state.user.id, shopId: membership.shop.id }
        : null;

    if (!sameNamespace(previous, next) && previous) {
      void purgeOfflineNamespace(previous);
      purgeOfflineLiteEntitlement(previous);
    }

    configureOfflineContext(next);
    rememberNamespace(next);

    if (next && browserOnline !== false) {
      void refreshOfflineLiteEntitlement().catch(() => undefined);
    }
    void refreshOfflineCounts?.();
  }, [state, membership, browserOnline, refreshOfflineCounts]);

  return null;
}
