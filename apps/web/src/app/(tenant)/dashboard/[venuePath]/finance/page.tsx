"use client";

import { FinanceHub } from "@/components/finance/finance-hub";
import { TenantPage } from "@/components/layout/tenant-page";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { hasPermission } from "@/lib/auth-client";
import { isFeatureUnlocked } from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useVenueAccess } from "@/lib/use-venue-access";

const GUIDE = {
  title: "Finance",
  description:
    "Revenue overview, transaction ledger, losses, and reports — not where you run the kitchen or floor.",
  capabilities: [
    "See combined revenue from menu, play, and reservations (read-only rollups).",
    "Record quick counter sales and track losses.",
    "Run 1–90 day reports with charts, print, and CSV export.",
    "Menu orders and play billing stay under Operations; reservations under Reservations.",
  ],
};

export default function FinancePage() {
  const { state } = useAuth();
  const access = useVenueAccess();
  const membership = useCurrentMembership();
  const perms = membership?.permissions ?? "";
  const transactionUnlocked = isFeatureUnlocked(
    access.enabledModules,
    "transaction",
  );
  const reportsUnlocked = isFeatureUnlocked(access.enabledModules, "reports");
  const unlocked = transactionUnlocked || reportsUnlocked;
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      hasPermission(perms, "transaction.write"));

  return (
    <TenantPage
      title={GUIDE.title}
      description={GUIDE.description}
      capabilities={GUIDE.capabilities}
    >
      {!canWrite ? (
        <p className="mb-4 text-xs text-zinc-500">
          View-only — ask an admin for transaction write access to edit records.
        </p>
      ) : null}
      <FeatureGate feature="transaction" unlocked={unlocked} title="Finance">
        <FinanceHub canWrite={canWrite && transactionUnlocked} />
      </FeatureGate>
    </TenantPage>
  );
}
