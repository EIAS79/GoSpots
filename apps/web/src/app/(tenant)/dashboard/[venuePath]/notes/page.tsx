"use client";

import {
  Archive,
  Loader2,
  Plus,
  StickyNote,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { TenantPage } from "@/components/layout/tenant-page";
import { ModalPortal } from "@/components/ui/modal-portal";
import { cn } from "@/lib/cn";
import { hasPermission } from "@/lib/auth-client";
import {
  archiveNote,
  createNote,
  fetchNotes,
  type NoteImportance,
  type ShopNote,
} from "@/lib/notes-client";
import { isFeatureUnlocked } from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useVenueAccess } from "@/lib/use-venue-access";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import { translate } from "@/lib/i18n";

type NoteT = (key: string, vars?: Record<string, string | number>) => string;

function importanceOptions(
  t: NoteT,
): { id: NoteImportance; label: string; hint: string }[] {
  return [
    {
      id: "INFO",
      label: t("notesPanel.importanceInfo"),
      hint: t("notesPanel.importanceInfoHint"),
    },
    {
      id: "NORMAL",
      label: t("notesPanel.importanceNormal"),
      hint: t("notesPanel.importanceNormalHint"),
    },
    {
      id: "IMPORTANT",
      label: t("notesPanel.importanceImportant"),
      hint: t("notesPanel.importanceImportantHint"),
    },
    {
      id: "URGENT",
      label: t("notesPanel.importanceUrgent"),
      hint: t("notesPanel.importanceUrgentHint"),
    },
  ];
}

function importanceStyle(level: NoteImportance) {
  switch (level) {
    case "URGENT":
      return "border-rose-400/40 bg-rose-500/15 text-rose-100";
    case "IMPORTANT":
      return "border-amber-400/40 bg-amber-500/15 text-amber-100";
    case "INFO":
      return "border-sky-400/35 bg-sky-500/10 text-sky-100";
    default:
      return "border-emerald-400/35 bg-emerald-500/10 text-emerald-100";
  }
}

function toLocalInputValue(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string, locale?: string) {
  const d = new Date(iso);
  return d.toLocaleString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultStaffName(user: {
  name: string | null;
  staffHandle?: string | null;
  email: string;
} | null) {
  if (!user) return "";
  return (
    user.name?.trim() ||
    user.staffHandle?.trim() ||
    user.email.split("@")[0] ||
    ""
  );
}

function previewBody(body: string, max = 120) {
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function NoteDetailModal({
  note,
  importanceLabel,
  canWrite,
  locale,
  t,
  onClose,
  onArchive,
}: {
  note: ShopNote;
  importanceLabel: string;
  canWrite: boolean;
  locale?: string;
  t: NoteT;
  onClose: () => void;
  onArchive: (id: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="note-detail-title"
          className="flex max-h-[min(90dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/50"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div className="min-w-0 space-y-2">
              <span
                className={cn(
                  "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  importanceStyle(note.importance),
                )}
              >
                {importanceLabel}
              </span>
              <h2
                id="note-detail-title"
                className="text-lg font-semibold leading-snug text-white"
              >
                {note.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("notesPanel.closeNote")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-zinc-500">
                  {t("notesPanel.forWhen")}
                </dt>
                <dd className="mt-0.5 text-zinc-200">
                  {formatWhen(note.relevantAt, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-zinc-500">
                  {t("notesPanel.byAuthor")}
                </dt>
                <dd className="mt-0.5 text-zinc-200">
                  {note.authorName}
                  <span className="text-zinc-500"> ({note.authorRole})</span>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] uppercase tracking-wide text-zinc-500">
                  {t("notesPanel.posted")}
                </dt>
                <dd className="mt-0.5 text-zinc-200">
                  {formatWhen(note.createdAt, locale)}
                </dd>
              </div>
            </dl>

            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
                {t("notesPanel.descriptionLabel")}
              </p>
              <div className="max-h-[min(40dvh,16rem)] overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/80 px-3.5 py-3">
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200">
                  {note.body}
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
            {canWrite ? (
              <button
                type="button"
                onClick={() => onArchive(note.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:border-white/20 hover:text-white"
                title={t("notesPanel.archiveTitle")}
              >
                <Archive size={14} />
                {t("notesPanel.archiveButton")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              {t("notesPanel.closeNote")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function NotesContent() {
  const guide = useDashboardGuide("notes");
  const { state } = useAuth();
  const membership = useCurrentMembership();
  const vs = useVenueSettingsOptional();
  const t: NoteT = vs?.t ?? ((key) => key);
  const locale = vs?.locale;
  const importanceOpts = useMemo(() => importanceOptions(t), [t]);
  const perms = membership?.permissions ?? "";
  const isOwner = membership?.role === "OWNER";
  const canWriteAuth =
    isOwner || hasPermission(perms, "notes.write");
  const canView =
    isOwner ||
    hasPermission(perms, "notes.read") ||
    hasPermission(perms, "notes.write");
  const authedUser = state.status === "authed" ? state.user : null;

  const [notes, setNotes] = useState<ShopNote[]>([]);
  const [canWrite, setCanWrite] = useState(canWriteAuth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [authorName, setAuthorName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [importance, setImportance] = useState<NoteImportance>("NORMAL");
  const [relevantAt, setRelevantAt] = useState(toLocalInputValue());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNotes(false);
      setNotes(data.notes);
      setCanWrite(data.canWrite);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("notesPanel.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (canView) void load();
    else setLoading(false);
  }, [canView, load]);

  const sorted = useMemo(() => {
    const rank: Record<NoteImportance, number> = {
      URGENT: 0,
      IMPORTANT: 1,
      NORMAL: 2,
      INFO: 3,
    };
    return [...notes].sort((a, b) => {
      const byImp = rank[a.importance] - rank[b.importance];
      if (byImp !== 0) return byImp;
      return new Date(b.relevantAt).getTime() - new Date(a.relevantAt).getTime();
    });
  }, [notes]);

  const selected = useMemo(
    () => sorted.find((n) => n.id === selectedId) ?? null,
    [sorted, selectedId],
  );

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim() || !authorName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createNote({
        title: title.trim(),
        body: body.trim(),
        importance,
        relevantAt: new Date(relevantAt).toISOString(),
        authorName: authorName.trim(),
      });
      setAuthorName(defaultStaffName(authedUser));
      setTitle("");
      setBody("");
      setImportance("NORMAL");
      setRelevantAt(toLocalInputValue());
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("notesPanel.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function onArchive(id: string) {
    setError(null);
    try {
      await archiveNote(id);
      setSelectedId((cur) => (cur === id ? null : cur));
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("notesPanel.archiveError"),
      );
    }
  }

  if (!canView) {
    return (
      <TenantPage title={guide.title} description={guide.description}>
        <p className="text-sm text-zinc-400">{t("notesPanel.noPermission")}</p>
      </TenantPage>
    );
  }

  const countLabel =
    sorted.length === 1
      ? t("notesPanel.listCount", { count: sorted.length })
      : t("notesPanel.listCountPlural", { count: sorted.length });

  return (
    <TenantPage
      title={guide.title}
      description={guide.description}
      capabilities={guide.capabilities}
      actions={
        canWrite ? (
          <button
            type="button"
            onClick={() =>
              setShowForm((v) => {
                if (!v) setAuthorName(defaultStaffName(authedUser));
                return !v;
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500"
          >
            {showForm ? <X size={14} /> : <Plus size={14} />}
            {showForm ? t("common.cancel") : t("notesPanel.newNote")}
          </button>
        ) : null
      }
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {showForm && canWrite ? (
        <form
          onSubmit={onCreate}
          className="mb-6 space-y-4 rounded-xl border border-emerald-400/25 bg-emerald-500/5 p-5"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
            <StickyNote size={16} />
            {t("notesPanel.newNoteHeading")}
          </div>

          <label className="block text-xs text-zinc-500">
            {t("notesPanel.staffNameLabel")}
            <input
              required
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder={t("notesPanel.staffNamePlaceholder")}
              maxLength={80}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40"
            />
          </label>

          <label className="block text-xs text-zinc-500">
            {t("notesPanel.titleLabel")}
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("notesPanel.titlePlaceholder")}
              maxLength={160}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40"
            />
          </label>

          <label className="block text-xs text-zinc-500">
            {t("notesPanel.descriptionLabel")}
            <textarea
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder={t("notesPanel.descriptionPlaceholder")}
              className="mt-1 max-h-64 w-full resize-y overflow-y-auto rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-zinc-500">
              {t("notesPanel.shiftTimeLabel")}
              <input
                type="datetime-local"
                required
                value={relevantAt}
                onChange={(e) => setRelevantAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40"
              />
            </label>
            <div>
              <p className="text-xs text-zinc-500">
                {t("notesPanel.importanceLabel")}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {importanceOpts.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    title={opt.hint}
                    onClick={() => setImportance(opt.id)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-xs transition",
                      importance === opt.id
                        ? importanceStyle(opt.id)
                        : "border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? t("notesPanel.posting") : t("notesPanel.postNote")}
          </button>
        </form>
      ) : null}

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      ) : sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-6 py-12 text-center text-sm text-zinc-500">
          {t("notesPanel.emptyState")}
        </p>
      ) : (
        <section className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/40">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <h3 className="text-sm font-medium text-white">
              {t("notesPanel.listHeading")}
            </h3>
            <span className="text-xs text-zinc-500">{countLabel}</span>
          </div>
          <ul className="divide-y divide-white/5">
            {sorted.map((note) => {
              const label =
                importanceOpts.find((o) => o.id === note.importance)?.label ??
                note.importance;
              return (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(note.id)}
                    className={cn(
                      "flex w-full items-start gap-3 border-l-2 bg-transparent px-4 py-3.5 text-left transition hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none",
                      note.importance === "URGENT"
                        ? "border-l-rose-400/70"
                        : note.importance === "IMPORTANT"
                          ? "border-l-amber-400/60"
                          : "border-l-transparent",
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                            importanceStyle(note.importance),
                          )}
                        >
                          {label}
                        </span>
                        <span className="truncate text-sm font-semibold text-white">
                          {note.title}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-sm leading-relaxed text-zinc-400">
                        {previewBody(note.body)}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {t("notesPanel.forWhen")}{" "}
                        <span className="text-zinc-400">
                          {formatWhen(note.relevantAt, locale)}
                        </span>
                        {" · "}
                        {t("notesPanel.byAuthor")}{" "}
                        <span className="text-zinc-400">{note.authorName}</span>
                        {" · "}
                        <span className="text-zinc-600">
                          {t("notesPanel.clickToRead")}
                        </span>
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {selected ? (
        <NoteDetailModal
          note={selected}
          importanceLabel={
            importanceOpts.find((o) => o.id === selected.importance)?.label ??
            selected.importance
          }
          canWrite={canWrite}
          locale={locale}
          t={t}
          onClose={() => setSelectedId(null)}
          onArchive={(id) => void onArchive(id)}
        />
      ) : null}
    </TenantPage>
  );
}

export default function NotesPage() {
  const access = useVenueAccess();
  const vs = useVenueSettingsOptional();
  const unlocked = isFeatureUnlocked(access.enabledModules, "notes");

  return (
    <FeatureGate
      feature="notes"
      unlocked={unlocked}
      title={vs?.t("notesPanel.featureTitle") ?? translate("en", "notesPanel.featureTitle")}
    >
      <NotesContent />
    </FeatureGate>
  );
}
