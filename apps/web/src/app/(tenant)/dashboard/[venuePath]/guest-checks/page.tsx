"use client";

import { GuestChecksPanel } from "@/components/guest-check/guest-checks-panel";
import { TenantPage } from "@/components/layout/tenant-page";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { hasPermission } from "@/lib/auth-client";
import { isFeatureUnlocked } from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useVenueAccess } from "@/lib/use-venue-access";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import styles from "./guest-checks.module.css";

export default function GuestChecksPage() {
  const guide = useDashboardGuide("guestChecks");
  const { state } = useAuth();
  const settings = useVenueSettingsOptional();
  const t = settings?.t ?? ((k: string) => k);
  const locale = settings?.locale ?? "en";
  const access = useVenueAccess();
  const membership = useCurrentMembership();
  const perms = membership?.permissions ?? "";
  const unlocked = isFeatureUnlocked(access.enabledModules, "transaction");
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      hasPermission(perms, "transaction.write"));

  const polish = locale === "pl";
  const title = polish ? "Rachunki gości" : "Guest tabs";
  const description = polish
    ? "Łącz czas gry, zamówienia z menu i rezerwacje jednego gościa w jeden bieżący rachunek. Game billing nadal wylicza i zapisuje opłaty za grę; ta strona tylko grupuje istniejące pozycje i nie tworzy drugiej płatności."
    : "Combine one guest's play time, menu orders and reservations into a single running check. Game Billing still calculates and records each play charge; this page only groups existing items and never creates a second payment.";
  const usageHint = polish
    ? "Używaj tego, gdy jeden gość lub stół ma kilka pozycji na jednym rachunku — np. 90 min bilardu + napoje. Jeśli rozliczasz wyłącznie czas gry, użyj Game billing."
    : "Use this when one guest or table has several items on one running bill — for example 90 minutes of billiards plus drinks. If you only charge for play time, use Game Billing.";

  return (
    <TenantPage
      title={title}
      description={description}
      capabilities={guide.capabilities}
    >
      <div className={styles.guestChecks}>
        <div className={styles.purposeCard}>
          <span className={styles.purposeLabel}>
            {polish ? "Kiedy tego używać" : "When to use this"}
          </span>
          <p>{usageHint}</p>
        </div>

        {!canWrite ? (
          <p className="mb-4 text-xs text-zinc-500">
            {t("guestChecks.viewOnly")}
          </p>
        ) : null}
        <FeatureGate
          feature="transaction"
          unlocked={unlocked}
          title={t("guestChecks.gateTitle")}
        >
          <GuestChecksPanel canWrite={canWrite && unlocked} />
        </FeatureGate>
      </div>
    </TenantPage>
  );
}
