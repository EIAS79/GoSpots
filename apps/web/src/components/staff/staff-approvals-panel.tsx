"use client";

import { Check, Loader2, ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  approveStaffRequest,
  approveStaffRequestWithManager,
  cancelStaffRequest,
  listStaffApprovals,
  rejectStaffRequest,
  type StaffActionRequest,
} from "@/lib/staff-approvals-client";
import { hasPermission } from "@/lib/auth-client";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useVenueSettings } from "@/lib/venue-settings-context";
import { cn } from "@/lib/cn";

function kindLabel(kind: StaffActionRequest["kind"]) {
  switch (kind) {
    case "MENU_ITEM_UPDATE":
      return "Menu item";
    case "RESOURCE_UNIT_UPDATE":
      return "Game / unit";
    case "RESOURCE_CATEGORY_UPDATE":
      return "Game offering / rates";
    default:
      return kind;
  }
}

function patchSummary(req: StaffActionRequest, formatFromEur: (n: number) => string) {
  const p = req.patch ?? {};
  const bits: string[] = [];
  if (p.name != null) bits.push(`name → ${p.name}`);
  if (p.price != null) bits.push(`price → ${formatFromEur(p.price)}`);
  if (p.hourlyRate != null) bits.push(`hourly → ${formatFromEur(p.hourlyRate)}`);
  if (p.isAvailable != null) bits.push(p.isAvailable ? "available" : "unavailable");
  if (p.rates?.length) bits.push(`${p.rates.length} rate(s)`);
  if (p.description !== undefined) bits.push("description change");
  return bits.length ? bits.join(" · ") : "Change details";
}

export function StaffApprovalsPanel() {
  const { t, formatFromEur } = useVenueSettings();
  const { state } = useAuth();
  const membership = useCurrentMembership();
  const [items, setItems] = useState<StaffActionRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<"self" | "manager">("self");

  const canApprove =
    membership?.role === "OWNER" ||
    membership?.role === "MANAGER" ||
    hasPermission(membership?.permissions ?? "", "shop.manage") ||
    hasPermission(membership?.permissions ?? "", "menu.write") ||
    hasPermission(membership?.permissions ?? "", "resource.write");

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const data = await listStaffApprovals();
      setItems(data.items);
      setPendingCount(data.pendingCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function runApprove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      if (mode === "manager") {
        await approveStaffRequestWithManager(id, {
          managerEmail,
          managerPassword,
        });
      } else {
        await approveStaffRequest(id, { password });
      }
      setPassword("");
      setManagerPassword("");
      setActiveId(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusyId(null);
    }
  }

  async function runReject(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await rejectStaffRequest(id, { password });
      setPassword("");
      setActiveId(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusyId(null);
    }
  }

  async function runCancel(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await cancelStaffRequest(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusyId(null);
    }
  }

  const me = state.status === "authed" ? state.user.id : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-zinc-300">
        <p className="flex items-start gap-2 font-medium text-amber-100">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-300" />
          One-time approvals only
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Approving a request applies that single change. It does not give the
          staff member permanent edit rights — they must request again next time.
          Every action is written to the audit log.
        </p>
        {pendingCount > 0 ? (
          <p className="mt-2 text-xs text-amber-200/90">
            {pendingCount} pending request{pendingCount === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">No staff change requests yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((req) => {
            const open = activeId === req.id;
            const pending = req.status === "PENDING";
            return (
              <li
                key={req.id}
                className="rounded-xl border border-white/10 bg-zinc-950/40 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {req.targetLabel}{" "}
                      <span className="text-xs font-normal text-zinc-500">
                        · {kindLabel(req.kind)}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {patchSummary(req, formatFromEur)}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      From {req.requester.name || req.requester.email} ·{" "}
                      <span
                        className={cn(
                          pending ? "text-amber-300" : "text-zinc-400",
                        )}
                      >
                        {req.status}
                      </span>
                    </p>
                    {req.note ? (
                      <p className="mt-1 text-xs text-zinc-500">Note: {req.note}</p>
                    ) : null}
                  </div>
                  {pending ? (
                    <div className="flex flex-wrap gap-2">
                      {canApprove ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveId(open ? null : req.id);
                            setMode("self");
                          }}
                          className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 ring-1 ring-emerald-400/30"
                        >
                          Review
                        </button>
                      ) : null}
                      {me === req.requester.id ? (
                        <button
                          type="button"
                          disabled={busyId === req.id}
                          onClick={() => void runCancel(req.id)}
                          className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 ring-1 ring-white/10 hover:text-white"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {pending && open && canApprove ? (
                  <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setMode("self")}
                        className={cn(
                          "rounded-full px-3 py-1",
                          mode === "self"
                            ? "bg-white/10 text-white"
                            : "text-zinc-500",
                        )}
                      >
                        My password
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("manager")}
                        className={cn(
                          "rounded-full px-3 py-1",
                          mode === "manager"
                            ? "bg-white/10 text-white"
                            : "text-zinc-500",
                        )}
                      >
                        Manager at this device
                      </button>
                    </div>

                    {mode === "self" ? (
                      <label className="block text-xs text-zinc-400">
                        Account password
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
                          autoComplete="current-password"
                        />
                      </label>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block text-xs text-zinc-400">
                          Manager email
                          <input
                            type="email"
                            value={managerEmail}
                            onChange={(e) => setManagerEmail(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
                          />
                        </label>
                        <label className="block text-xs text-zinc-400">
                          Manager password
                          <input
                            type="password"
                            value={managerPassword}
                            onChange={(e) => setManagerPassword(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
                            autoComplete="current-password"
                          />
                        </label>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={() => void runApprove(req.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-950 disabled:opacity-40"
                      >
                        {busyId === req.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                        Approve once
                      </button>
                      {mode === "self" ? (
                        <button
                          type="button"
                          disabled={busyId === req.id}
                          onClick={() => void runReject(req.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-200 ring-1 ring-rose-400/30 disabled:opacity-40"
                        >
                          <X size={14} />
                          Reject
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
