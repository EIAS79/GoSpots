import type { CheckoutIssueKind } from "./checkout-presenter";

export function SettlementStatus({
  loading = false,
  issue,
  detail,
}: {
  loading?: boolean;
  issue?: CheckoutIssueKind | null;
  detail?: string | null;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400" role="status">
        Refreshing authoritative checkout total…
      </div>
    );
  }

  if (!issue) return null;

  const copy: Record<CheckoutIssueKind, { title: string; body: string }> = {
    conflict: {
      title: "Check updated",
      body: "This check changed on another device. Reloading latest total.",
    },
    offline: {
      title: "Connection required",
      body: "Checkout requires connection until Offline Checkout is enabled.",
    },
    disabled: {
      title: "Checkout V2 unavailable",
      body: "Checkout V2 is not enabled for this venue.",
    },
    unauthorized: {
      title: "Checkout access required",
      body: "Your staff role does not have checkout.read permission.",
    },
    error: {
      title: "Checkout could not load",
      body: detail?.trim() || "The server preview could not be loaded. Try refreshing the check.",
    },
  };

  const message = copy[issue];
  return (
    <div
      className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3"
      role={issue === "error" || issue === "offline" ? "alert" : "status"}
      data-issue={issue}
    >
      <p className="text-sm font-semibold text-amber-200">{message.title}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-400">{message.body}</p>
    </div>
  );
}
