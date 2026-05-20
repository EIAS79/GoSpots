"use client";

import { FinanceHub } from "@/components/finance/finance-hub";
import { TenantPage } from "@/components/layout/tenant-page";
import { hasPermission } from "@/lib/auth-client";
import { useAuth } from "@/lib/use-auth";

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
  const membership =
    state.status === "authed" ? state.user.memberships[0] : null;
  const perms = membership?.permissions ?? "";
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      membership?.role === "MANAGER" ||
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
      <FinanceHub canWrite={canWrite} />
    </TenantPage>
  );
}
