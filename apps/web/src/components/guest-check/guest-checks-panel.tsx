"use client";

import {
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  Unlink,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api";
import {
  attachToGuestCheck,
  createGuestCheck,
  detachFromGuestCheck,
  fetchGuestChecks,
  voidGuestCheck,
  type GuestCheck,
} from "@/lib/guest-check-client";
import { fetchShopOrders, fetchPlaySessions } from "@/lib/finance-client";
import { fetchReservations } from "@/lib/reservations-client";
import { useVenueSettings, useVenueSettingsOptional } from "@/lib/venue-settings-context";

type AttachKind = "order" | "play" | "reservation";

export function GuestChecksPanel({ canWrite }: { canWrite: boolean }) {
  const { formatMoney } = useVenueSettings();
  const t = useVenueSettingsOptional()?.t ?? ((k: string) => k);
  const [checks, setChecks] = useState<GuestCheck[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [label, setLabel] = useState("");
  const [attachKind, setAttachKind] = useState<AttachKind>("order");
  const [attachId, setAttachId] = useState("");
  const [orderOptions, setOrderOptions] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [playOptions, setPlayOptions] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [reservationOptions, setReservationOptions] = useState<
    Array<{ id: string; label: string }>
  >([]);

  const selected = checks.find((c) => c.id === selectedId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchGuestChecks("OPEN");
      setChecks(res.checks);
      setSelectedId((prev) => {
        if (prev && res.checks.some((c) => c.id === prev)) return prev;
        return res.checks[0]?.id ?? null;
      });
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : t("guestChecks.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadAttachOptions = useCallback(async () => {
    try {
      const [orders, plays, reservations] = await Promise.all([
        fetchShopOrders({ status: "PENDING", take: 40 }),
        fetchPlaySessions({ status: "ACTIVE" }),
        fetchReservations(),
      ]);
      setOrderOptions(
        orders.map((o) => ({
          id: o.id,
          label: `${o.label?.trim() || o.id.slice(0, 8)} · ${o.total}`,
        })),
      );
      setPlayOptions(
        plays.slice(0, 40).map((p) => ({
          id: p.id,
          label: `${p.label?.trim() || p.id.slice(0, 8)} · ${p.amount}`,
        })),
      );
      setReservationOptions(
        reservations.reservations.slice(0, 40).map((r) => ({
          id: r.id,
          label: `${r.guestName?.trim() || r.id.slice(0, 8)} · ${new Date(r.startsAt).toLocaleString()}`,
        })),
      );
    } catch {
      /* attach pickers stay empty; staff can still use raw id */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadAttachOptions();
  }, [load, loadAttachOptions]);

  async function onCreate() {
    if (!canWrite || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createGuestCheck({
        guestName: guestName.trim() || undefined,
        label: label.trim() || undefined,
      });
      setGuestName("");
      setLabel("");
      await load();
      setSelectedId(created.id);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : t("guestChecks.createFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onVoid() {
    if (!canWrite || !selected || busy) return;
    if (!window.confirm(t("guestChecks.voidConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      await voidGuestCheck(selected.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("guestChecks.voidFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onAttach() {
    if (!canWrite || !selected || !attachId.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        attachKind === "order"
          ? { shopOrderId: attachId.trim() }
          : attachKind === "play"
            ? { playSessionId: attachId.trim() }
            : { reservationId: attachId.trim() };
      const updated = await attachToGuestCheck(selected.id, body);
      setChecks((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      setAttachId("");
      await loadAttachOptions();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : t("guestChecks.attachFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDetach(kind: AttachKind, id: string) {
    if (!canWrite || !selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        kind === "order"
          ? { shopOrderId: id }
          : kind === "play"
            ? { playSessionId: id }
            : { reservationId: id };
      const updated = await detachFromGuestCheck(selected.id, body);
      setChecks((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : t("guestChecks.detachFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  const options =
    attachKind === "order"
      ? orderOptions
      : attachKind === "play"
        ? playOptions
        : reservationOptions;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("guestChecks.refresh")}
        </button>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {canWrite ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-zinc-600">
            {t("guestChecks.guestName")}
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              placeholder={t("guestChecks.guestNamePlaceholder")}
            />
          </label>
          <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs text-zinc-600">
            {t("guestChecks.label")}
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              placeholder={t("guestChecks.labelPlaceholder")}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onCreate()}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("guestChecks.openTab")}
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("common.loading")}
        </div>
      ) : checks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
          {t("guestChecks.empty")}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_1fr]">
          <ul className="space-y-1">
            {checks.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left text-sm transition",
                    selectedId === c.id
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400",
                  )}
                >
                  <div className="font-medium">
                    {c.label?.trim() ||
                      c.guestName?.trim() ||
                      t("guestChecks.untitled")}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 text-xs",
                      selectedId === c.id ? "text-zinc-300" : "text-zinc-500",
                    )}
                  >
                    {formatMoney(Number(c.runningTotal))}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
                    <Receipt className="h-4 w-4" />
                    {selected.label?.trim() ||
                      selected.guestName?.trim() ||
                      t("guestChecks.untitled")}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {t("guestChecks.partySize", {
                      n: selected.partySize,
                    })}
                    {selected.guestName
                      ? ` · ${selected.guestName}`
                      : null}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    {t("guestChecks.runningTotal")}
                  </div>
                  <div className="text-xl font-semibold text-zinc-900">
                    {formatMoney(Number(selected.runningTotal))}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {t("guestChecks.breakdown", {
                      menu: formatMoney(Number(selected.menuTotal)),
                      play: formatMoney(Number(selected.playTotal)),
                      reservation: formatMoney(
                        Number(selected.reservationTotal),
                      ),
                    })}
                  </div>
                </div>
              </div>

              <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-100">
                {selected.totalLines.length === 0 ? (
                  <li className="px-3 py-4 text-sm text-zinc-500">
                    {t("guestChecks.noLines")}
                  </li>
                ) : (
                  selected.totalLines.map((line) => (
                    <li
                      key={`${line.sourceType}-${line.sourceId}`}
                      className={cn(
                        "flex items-center justify-between gap-2 px-3 py-2 text-sm",
                        line.excluded && "text-zinc-400",
                      )}
                    >
                      <div>
                        <div className={cn(line.excluded && "line-through")}>
                          {line.label}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {line.kind}
                          {line.excluded ? ` · ${t("guestChecks.excludedHint")}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>
                          {line.excluded
                            ? "—"
                            : formatMoney(Number(line.amount))}
                        </span>
                        {canWrite ? (
                          <button
                            type="button"
                            title={t("guestChecks.detach")}
                            disabled={busy}
                            onClick={() =>
                              void onDetach(
                                line.sourceType === "SHOP_ORDER"
                                  ? "order"
                                  : line.sourceType === "PLAY_SESSION"
                                    ? "play"
                                    : "reservation",
                                line.sourceId,
                              )
                            }
                            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                          >
                            <Unlink className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))
                )}
              </ul>

              {canWrite ? (
                <div className="flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3">
                  <label className="flex flex-col gap-1 text-xs text-zinc-600">
                    {t("guestChecks.attachType")}
                    <select
                      value={attachKind}
                      onChange={(e) => {
                        setAttachKind(e.target.value as AttachKind);
                        setAttachId("");
                      }}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="order">{t("guestChecks.typeOrder")}</option>
                      <option value="play">{t("guestChecks.typePlay")}</option>
                      <option value="reservation">
                        {t("guestChecks.typeReservation")}
                      </option>
                    </select>
                  </label>
                  <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-zinc-600">
                    {t("guestChecks.attachTarget")}
                    {options.length > 0 ? (
                      <select
                        value={attachId}
                        onChange={(e) => setAttachId(e.target.value)}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="">{t("guestChecks.pickTarget")}</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={attachId}
                        onChange={(e) => setAttachId(e.target.value)}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                        placeholder={t("guestChecks.idPlaceholder")}
                      />
                    )}
                  </label>
                  <button
                    type="button"
                    disabled={busy || !attachId.trim()}
                    onClick={() => void onAttach()}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {t("guestChecks.attach")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onVoid()}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {t("guestChecks.void")}
                  </button>
                </div>
              ) : null}

              <p className="text-xs text-zinc-500">{t("guestChecks.optionAHint")}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
