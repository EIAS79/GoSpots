"use client";

import {
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TenantPage } from "@/components/layout/tenant-page";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { cn } from "@/lib/cn";
import {
  AUDIT_ACTION_GROUPS,
  AUDIT_SECTIONS,
  sectionLabel,
} from "@/lib/audit";
import {
  deleteAuditEntries,
  deleteAuditEntry,
  downloadAuditCsv,
  fetchAuditLog,
  type AuditEntry,
} from "@/lib/audit-client";
import { formatDate } from "@/lib/format";
import { hasPermission } from "@/lib/auth-client";
import { isFeatureUnlocked } from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useVenueAccess } from "@/lib/use-venue-access";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatAuditValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (
      value.length > 0 &&
      typeof value[0] === "object" &&
      value[0] !== null &&
      "name" in value[0]
    ) {
      return (
        value as { quantity: number; name: string; subtotal?: number }[]
      )
        .map((l) => {
          const sub =
            l.subtotal != null ? ` (${l.subtotal})` : "";
          return `${l.quantity}× ${l.name}${sub}`;
        })
        .join(", ");
    }
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function AuditMetaDetails({ meta }: { meta: unknown }) {
  if (meta == null) return null;
  if (typeof meta !== "object") {
    return (
      <pre className="mt-2 text-xs text-zinc-400">{String(meta)}</pre>
    );
  }

  const m = meta as Record<string, unknown>;
  const displayRows: { label: string; value: string }[] = [];

  if (m.ticket) displayRows.push({ label: "Order", value: String(m.ticket) });
  if (m.statusLabel)
    displayRows.push({ label: "Status", value: String(m.statusLabel) });
  if (m.guestCount != null)
    displayRows.push({ label: "Guests", value: String(m.guestCount) });
  if (m.paymentMethod)
    displayRows.push({ label: "Payment", value: String(m.paymentMethod) });
  if (m.total != null)
    displayRows.push({ label: "Total", value: String(m.total) });
  if (m.itemsSummary)
    displayRows.push({ label: "Items", value: String(m.itemsSummary) });
  if (m.note && String(m.note).trim())
    displayRows.push({ label: "Note", value: String(m.note) });
  if (Array.isArray(m.activeLines) && m.activeLines.length > 0) {
    displayRows.push({
      label: "Line items",
      value: formatAuditValue(m.activeLines),
    });
  }

  const technicalKeys = Object.keys(m).filter(
    (k) =>
      ![
        "ticket",
        "statusLabel",
        "guestCount",
        "paymentMethod",
        "total",
        "itemsSummary",
        "note",
        "activeLines",
        "label",
        "status",
      ].includes(k),
  );

  return (
    <div className="mt-3 space-y-3">
      {displayRows.length > 0 ? (
        <dl className="grid gap-2 rounded-lg border border-white/5 bg-zinc-950/50 p-3 text-xs sm:grid-cols-2">
          {displayRows.map((row) => (
            <div key={row.label}>
              <dt className="text-zinc-600">{row.label}</dt>
              <dd className="mt-0.5 text-zinc-200">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {technicalKeys.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-400">
            Technical details
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-zinc-950/80 p-3 text-zinc-500">
            {JSON.stringify(m, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function AuditRow({
  row,
  expanded,
  onToggle,
  selected,
  onToggleSelect,
  canDelete,
  onDelete,
}: {
  row: AuditEntry;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const actor =
    row.actorName ?? row.actorEmail ?? row.actorRole ?? "Unknown user";

  return (
    <li
      className={cn(
        "rounded-xl border border-white/10 bg-zinc-950/40",
        selected && "ring-1 ring-emerald-400/30",
      )}
    >
      <div className="flex items-start gap-2 px-4 py-3">
        {canDelete ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(row.id)}
            className="mt-1 rounded border-white/20"
            aria-label={`Select audit entry ${row.id}`}
          />
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          className="mt-0.5 shrink-0 text-zinc-500 hover:text-zinc-300"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
              {sectionLabel(row.section)}
            </span>
            <span className="text-xs text-zinc-600">{formatDate(row.createdAt)}</span>
          </div>
          <p className="mt-1 text-sm font-medium text-zinc-200">{row.summary}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {actor}
            {row.actorRole ? ` · ${row.actorRole}` : ""}
            {row.action ? ` · ${row.action}` : ""}
          </p>
        </button>
        {canDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="shrink-0 rounded-md p-1.5 text-zinc-600 transition hover:bg-rose-500/10 hover:text-rose-400"
            title="Delete audit entry (owner only)"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div className="border-t border-white/5 px-4 pb-4 pl-10">
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-zinc-600">Action</dt>
              <dd className="font-mono text-zinc-300">{row.action}</dd>
            </div>
            <div>
              <dt className="text-zinc-600">Actor email</dt>
              <dd className="text-zinc-300">{row.actorEmail ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-600">IP address</dt>
              <dd className="text-zinc-300">{row.ipAddress ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-600">Entry ID</dt>
              <dd className="font-mono text-zinc-500">{row.id}</dd>
            </div>
          </dl>
          <AuditMetaDetails meta={row.metaParsed ?? row.meta} />
        </div>
      ) : null}
    </li>
  );
}

export default function AuditPage() {
  const guide = useDashboardGuide("audit");
  const { state } = useAuth();
  const membership = useCurrentMembership();
  const access = useVenueAccess();
  const unlocked = isFeatureUnlocked(access.enabledModules, "audit");
  const canViewAudit =
    membership?.role === "OWNER" ||
    hasPermission(membership?.permissions ?? "", "audit.read");
  const isOwner = membership?.role === "OWNER";
  const isSuperAdmin =
    state.status === "authed" && state.user.systemRole === "SUPER_ADMIN";

  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [section, setSection] = useState("all");
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [data, setData] = useState<Awaited<ReturnType<typeof fetchAuditLog>> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAuditLog({
        from,
        to,
        section,
        action,
        search: search || undefined,
        take: 200,
      });
      setData(result);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit log.");
    } finally {
      setLoading(false);
    }
  }, [from, to, section, action, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const canDelete = (data?.canDelete ?? false) || isOwner || isSuperAdmin;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(new Set((data?.items ?? []).map((i) => i.id)));
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (
      !confirm(
        `Permanently delete ${selected.size} audit entr${selected.size === 1 ? "y" : "ies"}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteAuditEntries({ ids: [...selected] });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAllMatching = async () => {
    const total = data?.total ?? 0;
    if (total === 0) return;
    if (
      !confirm(
        `Permanently delete all ${total} audit entries matching your filters? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteAuditEntries({
        allMatching: true,
        from,
        to,
        section,
        action,
        search: search || undefined,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  if (state.status === "authed" && !canViewAudit) {
    return (
      <TenantPage title={guide.title} description={guide.description}>
        <p className="text-sm text-zinc-400">
          You do not have permission to view the audit log.
        </p>
      </TenantPage>
    );
  }

  return (
    <TenantPage
      title={guide.title}
      description={guide.description}
      capabilities={guide.capabilities}
      actions={
        <button
          type="button"
          disabled={exporting || loading}
          onClick={() => {
            setExporting(true);
            void downloadAuditCsv({ from, to, section, action, search })
              .catch((e) =>
                setError(e instanceof Error ? e.message : "Export failed."),
              )
              .finally(() => setExporting(false));
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          Download CSV
        </button>
      }
    >
      <FeatureGate feature="audit" unlocked={unlocked}>
      {canDelete ? (
        <p className="mb-4 rounded-lg border border-rose-400/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-200/90">
          Owner mode: you can permanently delete audit entries. Prefer export +
          archive operationally — deletes cannot be undone.
        </p>
      ) : (
        <p className="mb-4 text-xs text-zinc-600">
          You can view and export. Only the venue owner can delete audit entries.
        </p>
      )}

      <div className="mb-6 grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-zinc-500">
          From date
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          To date
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          Section
          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
          >
            {AUDIT_SECTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-zinc-500">
          Action type
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
          >
            {AUDIT_ACTION_GROUPS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-zinc-500 sm:col-span-2 lg:col-span-3">
          Search
          <div className="relative mt-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600"
            />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSearch(searchInput.trim());
              }}
              placeholder="Summary, action, actor…"
              className="w-full rounded-lg border border-white/10 bg-zinc-950 py-1.5 pl-8 pr-3 text-sm text-white"
            />
          </div>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setSearch(searchInput.trim())}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-500"
          >
            Apply filters
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">
              Showing {data?.items.length ?? 0} of {data?.total ?? 0} entries
              {selected.size > 0 ? ` · ${selected.size} selected` : ""}
            </p>
            {canDelete ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  disabled={(data?.items.length ?? 0) === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                >
                  Select all in view
                </button>
                {selected.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Clear selection
                  </button>
                ) : null}
                {selected.size > 0 ? (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void handleDeleteSelected()}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 disabled:opacity-50"
                  >
                    {deleting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    Delete selected ({selected.size})
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={deleting || (data?.total ?? 0) === 0}
                  onClick={() => void handleDeleteAllMatching()}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-400/30 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  Delete all matching
                </button>
              </div>
            ) : null}
          </div>
          <ul className="space-y-2">
            {(data?.items ?? []).map((row) => (
              <AuditRow
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                onToggle={() =>
                  setExpandedId((id) => (id === row.id ? null : row.id))
                }
                selected={selected.has(row.id)}
                onToggleSelect={toggleSelect}
                canDelete={canDelete}
                onDelete={() => {
                  if (
                    !confirm(
                      "Permanently delete this audit entry? This cannot be undone.",
                    )
                  )
                    return;
                  void deleteAuditEntry(row.id)
                    .then(() => load())
                    .catch((e) =>
                      setError(
                        e instanceof Error ? e.message : "Delete failed.",
                      ),
                    );
                }}
              />
            ))}
          </ul>
          {(data?.items.length ?? 0) === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              No audit entries match your filters.
            </p>
          ) : null}
        </>
      )}
      </FeatureGate>
    </TenantPage>
  );
}
