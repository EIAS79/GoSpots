"use client";

import { useEffect, useRef } from "react";
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

function sameNamespace(a: OfflineNamespace | null, b: OfflineNamespace | null) {
  return a?.userId === b?.userId && a?.shopId === b?.shopId;
}

export function OfflineContextBridge() {
  const { state } = useAuth();
  const membership = useCurrentMembership();
  const connectivity = useConnectivityOptional();
  const previousRef = useRef<OfflineNamespace | null>(null);

  useEffect(() => {
    const next: OfflineNamespace | null =
      state.status === "authed" && membership
        ? { userId: state.user.id, shopId: membership.shop.id }
        : null;
    const previous = previousRef.current;

    if (!sameNamespace(previous, next) && previous) {
      // Venue switches intentionally purge the previous tenant namespace. The
      // user must not carry another Shop's cached operational data forward.
      void purgeOfflineNamespace(previous);
      purgeOfflineLiteEntitlement(previous);
    }

    previousRef.current = next;
    configureOfflineContext(next);

    if (next && connectivity?.browserOnline !== false) {
      void refreshOfflineLiteEntitlement().catch(() => undefined);
    }
    void connectivity?.refreshOfflineCounts();
  }, [state, membership, connectivity]);

  return null;
}
