"use client";

import { useAuth } from "./use-auth";
import { findMembershipForVenuePath } from "./venue-dashboard";
import { useVenuePath } from "./venue-context";

export function useCurrentMembership() {
  const { state } = useAuth();
  const venuePath = useVenuePath();
  if (state.status !== "authed") return null;
  return findMembershipForVenuePath(state.user.memberships, venuePath);
}
