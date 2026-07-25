"use client";

import { Loader2, Send } from "lucide-react";
import { useState } from "react";
import {
  approveStaffRequestWithManager,
  createStaffApprovalRequest,
  type StaffActionKind,
  type StaffActionPatch,
} from "@/lib/staff-approvals-client";
import { useVenueSettings } from "@/lib/venue-settings-context";

/**
 * Staff without write perms: propose a one-time change.
 * Optional: manager can approve immediately on this device.
 */
export function RequestPrivilegedEditDialog({
  open,
  onClose,
  kind,
  targetId,
  targetLabel,
  initialPatch,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  kind: StaffActionKind;
  targetId: string;
  targetLabel: string;
  initialPatch: StaffActionPatch;
  onSubmitted?: () => void;
}) {
  const { t, formatFromEur } = useVenueSettings();
  const [note, setNote] = useState("");
  const [price, setPrice] = useState(
    initialPatch.price != null ? String(initialPatch.price) : "",
  );
  const [name, setName] = useState(initialPatch.name ?? targetLabel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPassword, setManagerPassword] = useState("");

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const patch: StaffActionPatch = {
        ...initialPatch,
        name: name.trim() || undefined,
      };
      if (price.trim() !== "") {
        const n = Number(price);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error("Enter a valid price.");
        }
        if (kind === "RESOURCE_UNIT_UPDATE") patch.hourlyRate = n;
        else if (kind === "MENU_ITEM_UPDATE") patch.price = n;
      }
      const row = await createStaffApprovalRequest({
        kind,
        targetId,
        patch,
        note: note.trim() || undefined,
      });
      setCreatedId(row.id);
      onSubmitted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function approveNow() {
    if (!createdId) return;
    setBusy(true);
    setError(null);
    try {
      await approveStaffRequestWithManager(createdId, {
        managerEmail,
        managerPassword,
      });
      onClose();
      onSubmitted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal
        className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"
      >
        <h3 className="text-lg font-semibold text-white">Request edit approval</h3>
        <p className="mt-1 text-sm text-zinc-400">
          You don’t have permission to change “{targetLabel}” yourself. Send a
          one-time request — an owner/manager must approve each change.
        </p>

        {!createdId ? (
          <div className="mt-4 space-y-3">
            <label className="block text-xs text-zinc-400">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>
            {kind !== "RESOURCE_CATEGORY_UPDATE" ? (
              <label className="block text-xs text-zinc-400">
                {kind === "RESOURCE_UNIT_UPDATE" ? "Hourly rate" : "Price"}{" "}
                {initialPatch.price != null
                  ? `(now ${formatFromEur(initialPatch.price)})`
                  : initialPatch.hourlyRate != null
                    ? `(now ${formatFromEur(initialPatch.hourlyRate)})`
                    : ""}
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
            ) : null}
            <label className="block text-xs text-zinc-400">
              Note for manager (optional)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
        ) : (
          <div className="mt-4 space-y-3 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] p-3">
            <p className="text-sm text-emerald-100">
              Request sent. Waiting in Staff approvals — or a manager can approve
              here now (one time only).
            </p>
            <label className="block text-xs text-zinc-400">
              Manager email
              <input
                type="email"
                value={managerEmail}
                onChange={(e) => setManagerEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Manager password
              <input
                type="password"
                value={managerPassword}
                onChange={(e) => setManagerPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                autoComplete="current-password"
              />
            </label>
          </div>
        )}

        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-white"
          >
            {createdId ? "Done" : "Cancel"}
          </button>
          {!createdId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              Send request
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void approveNow()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : null}
              Approve once now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
