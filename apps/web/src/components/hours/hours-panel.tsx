"use client";

import { CalendarOff, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { OpeningHourRow, ScheduleException } from "@/lib/hours-client";

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type WeeklyDraft = {
  weekday: number;
  isClosed: boolean;
  opensAt: string;
  closesAt: string;
};

export function HoursPanel({
  weekly,
  exceptions,
  canWrite,
  saving,
  onSaveWeekly,
  onAddException,
  onUpdateException,
  onDeleteException,
}: {
  weekly: WeeklyDraft[];
  exceptions: ScheduleException[];
  canWrite: boolean;
  saving: boolean;
  onSaveWeekly: (days: WeeklyDraft[]) => Promise<void>;
  onAddException: (body: {
    date: string;
    label?: string;
    isClosed: boolean;
    opensAt?: string;
    closesAt?: string;
  }) => Promise<void>;
  onUpdateException: (
    id: string,
    body: {
      date: string;
      label?: string;
      isClosed: boolean;
      opensAt?: string;
      closesAt?: string;
    },
  ) => Promise<void>;
  onDeleteException: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(weekly);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(weekly);
    setDirty(false);
  }, [weekly]);

  const [exDate, setExDate] = useState("");
  const [exLabel, setExLabel] = useState("");
  const [exClosed, setExClosed] = useState(true);
  const [exOpens, setExOpens] = useState("09:00");
  const [exCloses, setExCloses] = useState("22:00");
  const [exSaving, setExSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editClosed, setEditClosed] = useState(true);
  const [editOpens, setEditOpens] = useState("09:00");
  const [editCloses, setEditCloses] = useState("22:00");
  const [editSaving, setEditSaving] = useState(false);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return exceptions.filter((e) => e.date >= today);
  }, [exceptions]);

  function patchDay(weekday: number, patch: Partial<WeeklyDraft>) {
    setDraft((rows) =>
      rows.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)),
    );
    setDirty(true);
  }

  function startEditing(ex: ScheduleException) {
    setEditingId(ex.id);
    setEditDate(ex.date);
    setEditLabel(ex.label ?? "");
    setEditClosed(ex.isClosed);
    setEditOpens(ex.opensAt?.slice(0, 5) ?? "09:00");
    setEditCloses(ex.closesAt?.slice(0, 5) ?? "22:00");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditSaving(false);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 md:p-6">
        <h2 className="text-base font-semibold text-white">Weekly hours</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Regular opening times guests see on your venue page.
        </p>
        <ul className="mt-4 divide-y divide-white/5">
          {draft.map((row) => (
            <li
              key={row.weekday}
              className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span className="w-28 shrink-0 text-sm text-zinc-300">
                {DAY_LABELS[row.weekday]}
              </span>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  disabled={!canWrite}
                  checked={row.isClosed}
                  onChange={(e) =>
                    patchDay(row.weekday, { isClosed: e.target.checked })
                  }
                  className="rounded border-white/20"
                />
                Closed
              </label>
              {!row.isClosed ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="time"
                    disabled={!canWrite}
                    value={row.opensAt}
                    onChange={(e) =>
                      patchDay(row.weekday, { opensAt: e.target.value })
                    }
                    className="rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
                  />
                  <span className="text-zinc-600">–</span>
                  <input
                    type="time"
                    disabled={!canWrite}
                    value={row.closesAt}
                    onChange={(e) =>
                      patchDay(row.weekday, { closesAt: e.target.value })
                    }
                    className="rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
                  />
                </div>
              ) : (
                <span className="text-xs text-zinc-600">No service</span>
              )}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <button
            type="button"
            disabled={saving || !dirty}
            onClick={() => {
              void onSaveWeekly(draft).then(() => setDirty(false));
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Save weekly hours
          </button>
        ) : null}
      </section>

      <section className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 md:p-6">
        <div className="flex items-start gap-3">
          <CalendarOff className="mt-0.5 shrink-0 text-amber-400/80" size={18} />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white">
              Closures & special days
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Private events, holidays, or different hours on a specific date.
            </p>
          </div>
        </div>

        {canWrite ? (
          <form
            className="mt-4 grid gap-3 rounded-lg border border-white/10 bg-zinc-950/60 p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!exDate) return;
              setExSaving(true);
              void onAddException({
                date: exDate,
                label: exLabel.trim() || undefined,
                isClosed: exClosed,
                opensAt: exClosed ? undefined : exOpens,
                closesAt: exClosed ? undefined : exCloses,
              })
                .then(() => {
                  setExDate("");
                  setExLabel("");
                  setExClosed(true);
                })
                .finally(() => setExSaving(false));
            }}
          >
            <label className="block text-xs text-zinc-500 sm:col-span-2">
              Date
              <input
                type="date"
                required
                value={exDate}
                onChange={(e) => setExDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500 sm:col-span-2">
              Note (optional)
              <input
                value={exLabel}
                onChange={(e) => setExLabel(e.target.value)}
                placeholder="e.g. Staff party, maintenance"
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300 sm:col-span-2">
              <input
                type="checkbox"
                checked={exClosed}
                onChange={(e) => setExClosed(e.target.checked)}
                className="rounded border-white/20"
              />
              Closed all day
            </label>
            {!exClosed ? (
              <>
                <label className="block text-xs text-zinc-500">
                  Opens
                  <input
                    type="time"
                    required
                    value={exOpens}
                    onChange={(e) => setExOpens(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  Closes
                  <input
                    type="time"
                    required
                    value={exCloses}
                    onChange={(e) => setExCloses(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                </label>
              </>
            ) : null}
            <button
              type="submit"
              disabled={exSaving || !exDate}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 sm:col-span-2 sm:justify-self-start"
            >
              {exSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Add date
            </button>
          </form>
        ) : null}

        <ul className="mt-4 space-y-2">
          {upcoming.length === 0 ? (
            <li className="text-sm text-zinc-600">No upcoming exceptions.</li>
          ) : (
            upcoming.map((ex) => (
              <li
                key={ex.id}
                className="rounded-lg border border-white/10 bg-zinc-950/50 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-white">{formatDate(ex.date)}</p>
                    <p className="text-xs text-zinc-500">
                      {ex.label || (ex.isClosed ? "Closed" : "Special hours")}
                      {ex.isClosed
                        ? ""
                        : ex.opensAt && ex.closesAt
                          ? ` · ${ex.opensAt} – ${ex.closesAt}`
                          : ""}
                    </p>
                  </div>
                  {canWrite ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEditing(ex)}
                        className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
                        aria-label="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteException(ex.id)}
                        className="rounded-lg p-2 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300"
                        aria-label="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : null}
                </div>
                {canWrite && editingId === ex.id ? (
                  <form
                    className="mt-3 grid gap-3 rounded-lg border border-white/10 bg-zinc-900/70 p-3 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!editDate) return;
                      setEditSaving(true);
                      void onUpdateException(ex.id, {
                        date: editDate,
                        label: editLabel.trim() || undefined,
                        isClosed: editClosed,
                        opensAt: editClosed ? undefined : editOpens,
                        closesAt: editClosed ? undefined : editCloses,
                      })
                        .then(() => cancelEditing())
                        .finally(() => setEditSaving(false));
                    }}
                  >
                    <div className="flex items-center justify-between sm:col-span-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Edit exception
                      </p>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="rounded-lg p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
                        aria-label="Cancel edit"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <label className="block text-xs text-zinc-500 sm:col-span-2">
                      Date
                      <input
                        type="date"
                        required
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                      />
                    </label>
                    <label className="block text-xs text-zinc-500 sm:col-span-2">
                      Note (optional)
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        placeholder="e.g. Staff party, maintenance"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-zinc-300 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={editClosed}
                        onChange={(e) => setEditClosed(e.target.checked)}
                        className="rounded border-white/20"
                      />
                      Closed all day
                    </label>
                    {!editClosed ? (
                      <>
                        <label className="block text-xs text-zinc-500">
                          Opens
                          <input
                            type="time"
                            required
                            value={editOpens}
                            onChange={(e) => setEditOpens(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                          />
                        </label>
                        <label className="block text-xs text-zinc-500">
                          Closes
                          <input
                            type="time"
                            required
                            value={editCloses}
                            onChange={(e) => setEditCloses(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                          />
                        </label>
                      </>
                    ) : null}
                    <div className="flex gap-2 sm:col-span-2">
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={editSaving || !editDate}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                      >
                        {editSaving ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : null}
                        Save changes
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

export function weeklyToDraft(rows: OpeningHourRow[]): WeeklyDraft[] {
  const byDay = new Map(rows.map((r) => [r.weekday, r]));
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const r = byDay.get(weekday);
    return {
      weekday,
      isClosed: r?.isClosed ?? weekday === 0,
      opensAt: r?.opensAt?.slice(0, 5) ?? "09:00",
      closesAt: r?.closesAt?.slice(0, 5) ?? "22:00",
    };
  });
}

function formatDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
