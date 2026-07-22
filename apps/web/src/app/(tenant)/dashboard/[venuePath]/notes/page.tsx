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
              className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40"
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
        <ul className="space-y-3">
          {sorted.map((note) => (
            <li
              key={note.id}
              className={cn(
                "rounded-xl border px-4 py-4",
                note.importance === "URGENT"
                  ? "border-rose-400/30 bg-rose-500/[0.06]"
                  : note.importance === "IMPORTANT"
                    ? "border-amber-400/25 bg-amber-500/[0.05]"
                    : "border-white/10 bg-zinc-950/50",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        importanceStyle(note.importance),
                      )}
                    >
                      {importanceOpts.find((o) => o.id === note.importance)
                        ?.label ?? note.importance}
                    </span>
                    <h3 className="text-sm font-semibold text-white">
                      {note.title}
                    </h3>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                    {note.body}
                  </p>
                  <p className="mt-3 text-[11px] text-zinc-500">
                    {t("notesPanel.forWhen")}{" "}
                    <span className="text-zinc-300">
                      {formatWhen(note.relevantAt, locale)}
                    </span>
                    {" · "}
                    {t("notesPanel.byAuthor")}{" "}
                    <span className="text-zinc-300">{note.authorName}</span>
                    <span className="text-zinc-600">
                      {" "}
                      ({note.authorRole})
                    </span>
                    {" · "}
                    {t("notesPanel.posted")} {formatWhen(note.createdAt, locale)}
                  </p>
                </div>
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => void onArchive(note.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                    title={t("notesPanel.archiveTitle")}
                  >
                    <Archive size={12} />
                    {t("notesPanel.archiveButton")}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
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
