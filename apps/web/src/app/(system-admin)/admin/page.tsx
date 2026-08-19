"use client";

import Link from "next/link";
import { SystemMailOutboxPanel } from "@/components/admin/system-mail-outbox-panel";
import { SystemSaasAdminPanel } from "@/components/admin/system-saas-admin-panel";
import { translate } from "@/lib/i18n";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { useAuth } from "@/lib/use-auth";

export default function SystemAdminPage() {
  const { state } = useAuth();
  const { locale } = usePublicPrefs();
  const t = (key: string) => translate(locale, key);

  if (state.status === "loading") {
    return (
      <main className="mx-auto max-w-6xl px-8 py-10 text-sm text-zinc-400">
        {t("mailSystemOutbox.authLoading")}
      </main>
    );
  }

  if (state.status !== "authed") {
    return (
      <main className="mx-auto max-w-6xl px-8 py-10">
        <h1 className="text-lg font-semibold text-white">
          {t("mailSystemOutbox.pageTitle")}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {t("mailSystemOutbox.signInRequired")}
        </p>
        <Link
          href="/login?next=/admin"
          className="mt-4 inline-block text-sm text-violet-300 hover:text-violet-200"
        >
          {t("mailSystemOutbox.signIn")}
        </Link>
      </main>
    );
  }

  if (state.user.systemRole !== "SUPER_ADMIN") {
    return (
      <main className="mx-auto max-w-6xl px-8 py-10">
        <h1 className="text-lg font-semibold text-white">
          {t("mailSystemOutbox.pageTitle")}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {t("mailSystemOutbox.forbidden")}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-8 py-10">
      <div>
        <h1 className="text-lg font-semibold text-white">
          {t("mailSystemOutbox.pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          SaaS operations, safe tenant diagnostics, entitlements, and platform delivery queues.
        </p>
      </div>
      <SystemSaasAdminPanel />
      <SystemMailOutboxPanel />
    </main>
  );
}
