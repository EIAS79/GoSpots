"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  CheckCheck,
  Clock,
  CreditCard,
  Download,
  Gamepad2,
  Loader2,
  MailOpen,
  Sparkles,
  Trash2,
  UserCog,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TenantPage } from "@/components/layout/tenant-page";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import {
  NOTIFICATION_SECTION_VALUES,
  sectionLabel,
} from "@/lib/notification-sections";
import {
  archiveNotifications,
  deleteNotifications,
  downloadNotificationsCsv,
  unarchiveNotifications,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  type NotificationRow,
  type NotificationStatus,
} from "@/lib/notifications-client";
import { hasPermission } from "@/lib/auth-client";
import { isFeatureUnlocked } from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useVenueAccess } from "@/lib/use-venue-access";
import { useVenueHref } from "@/lib/venue-context";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import { useLiveData } from "@/lib/use-live-data";
import { useNotificationsSse } from "@/lib/use-notifications-sse";
import { notificationNavHref } from "@/lib/safe-app-href";

const TYPE_ICON: Record<string, typeof Bell> = {
  SYSTEM: Bell,
  TRIAL: Sparkles,
  SUBSCRIPTION: CreditCard,
  RESERVATION: Clock,
  OPERATIONS: Gamepad2,
  BILLING: CreditCard,
  STAFF: UserCog,
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type NotifT = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

function NotificationItem({
  row,
  selected,
  onToggleSelect,
  onRead,
  onUnread,
  hrefBase,
  showCheckboxes,
  isArchivedView,
  t,
}: {
  row: NotificationRow;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onRead: (id: string) => void;
  onUnread: (id: string) => void;
  hrefBase: string;
  showCheckboxes: boolean;
  isArchivedView: boolean;
  t: NotifT;
}) {
  const Icon = TYPE_ICON[row.type] ?? Bell;
  const unread = !row.readAt;
  const target = notificationNavHref(hrefBase, row.href);

  const inner = (
    <>
      {showCheckboxes ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(row.id)}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 rounded border-white/20"
        />
      ) : null}
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
          unread ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-800 text-zinc-500",
        )}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "font-medium",
              unread ? "text-zinc-100" : "text-zinc-400",
            )}
          >
            {row.title}
          </p>
          <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500">
            {sectionLabel(row.section, t)}
          </span>
          {unread ? (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          ) : null}
        </div>
        <p className="mt-0.5 text-sm leading-snug text-zinc-500">{row.body}</p>
        <p className="mt-1.5 text-xs text-zinc-600">{formatDate(row.createdAt)}</p>
        {!isArchivedView ? (
          <div className="mt-2 flex gap-2">
            {unread ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRead(row.id);
                }}
                className="text-[11px] text-emerald-400 hover:underline"
              >
                {t("notif.markRead")}
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onUnread(row.id);
                }}
                className="text-[11px] text-zinc-500 hover:underline"
              >
                {t("notif.markUnread")}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </>
  );

  const className = cn(
    "flex w-full gap-3 rounded-xl border px-4 py-3 text-left transition",
    unread && !isArchivedView
      ? "border-emerald-400/15 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.07]"
      : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]",
    selected && "ring-1 ring-violet-400/40",
  );

  if (target && !isArchivedView) {
    return (
      <Link
        href={target}
        className={className}
        onClick={() => unread && onRead(row.id)}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={() => onToggleSelect(row.id)}>
      {inner}
    </button>
  );
}

export default function NotificationsPage() {
  const guide = useDashboardGuide("notifications");
  const vs = useVenueSettingsOptional();
  const t: NotifT = vs?.t ?? ((key) => key);
  const { state } = useAuth();
  const membership = useCurrentMembership();
  const access = useVenueAccess();
  const unlocked = isFeatureUnlocked(access.enabledModules, "notifications");
  const canViewNotifications =
    membership?.role === "OWNER" ||
    hasPermission(membership?.permissions ?? "", "notifications.read");
  const isOwner =
    membership?.role === "OWNER" ||
    (state.status === "authed" && state.user.systemRole === "SUPER_ADMIN");
  const hrefBase = useVenueHref("");
  const notificationsHref = useVenueHref("/notifications");
  const archivedHref = useVenueHref("/notifications?status=archived");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<NotificationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [canDelete, setCanDelete] = useState(false);
  const [status, setStatus] = useState<NotificationStatus>(() =>
    searchParams.get("status") === "archived" ? "archived" : "all",
  );
  const [section, setSection] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      return fetchNotifications({
        status,
        section: section === "all" ? undefined : section,
        from: from || undefined,
        to: to || undefined,
        take: 100,
      })
        .then((data) => {
          setItems(data.items);
          setTotal(data.total);
          setUnreadCount(data.unreadCount);
          setCanDelete(data.canDelete ?? false);
          if (!opts.silent) setSelected(new Set());
          return true as const;
        })
        .catch(() => false as const)
        .finally(() => {
          if (!opts.silent) setLoading(false);
        });
    },
    [status, section, from, to],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(() => load({ silent: true }), [status, section, from, to], {
    intervalMs: 20_000,
  });

  // SSE hint → silent refetch; 20s poll remains for multi-instance / reconnect gaps.
  useNotificationsSse({
    onNotification: () => {
      void load({ silent: true });
    },
  });

  useEffect(() => {
    if (searchParams.get("status") === "archived") {
      setStatus("archived");
    } else if (searchParams.get("status") === null && status === "archived") {
      setStatus("all");
    }
  }, [searchParams, status]);

  const handleRead = async (id: string) => {
    await markNotificationRead(id);
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const handleUnread = async (id: string) => {
    await markNotificationUnread(id);
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: null } : n)),
    );
    setUnreadCount((c) => c + 1);
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      await load();
    } finally {
      setMarkingAll(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(new Set(items.map((i) => i.id)));
  };

  const handleArchive = async (opts: {
    ids?: string[];
    allMatching?: boolean;
  }) => {
    setArchiving(true);
    try {
      await archiveNotifications({
        ...opts,
        from: from || undefined,
        to: to || undefined,
        section: section === "all" ? undefined : section,
        status:
          status === "archived" || status === "all" ? "all"
          : status === "unread" ? "unread"
          : "read",
      });
      await load();
    } finally {
      setArchiving(false);
    }
  };

  const isArchivedView = status === "archived";
  const showCheckboxes = true;

  const setStatusWithUrl = (next: NotificationStatus) => {
    setStatus(next);
    if (next === "archived") {
      router.replace(archivedHref);
    } else {
      router.replace(notificationsHref);
    }
  };

  const handleUnarchive = async (opts: {
    ids?: string[];
    allMatching?: boolean;
  }) => {
    setArchiving(true);
    setError(null);
    try {
      await unarchiveNotifications({
        ...opts,
        from: from || undefined,
        to: to || undefined,
        section: section === "all" ? undefined : section,
      });
      await load();
    } finally {
      setArchiving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await downloadNotificationsCsv({
        status,
        section: section === "all" ? undefined : section,
        from: from || undefined,
        to: to || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("notif.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async (opts: {
    ids?: string[];
    allMatching?: boolean;
  }) => {
    const count = opts.allMatching ? total : (opts.ids?.length ?? 0);
    const confirmMsg =
      count === 1
        ? t("notif.deleteConfirmOne")
        : t("notif.deleteConfirmMany", { count });
    if (!confirm(confirmMsg)) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteNotifications({
        ...opts,
        from: from || undefined,
        to: to || undefined,
        section: section === "all" ? undefined : section,
        status,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("notif.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  if (state.status === "authed" && !canViewNotifications) {
    return (
      <TenantPage title={guide.title} description={guide.description}>
        <p className="text-sm text-zinc-400">{t("notif.noPermission")}</p>
      </TenantPage>
    );
  }

  return (
    <TenantPage
      title={isArchivedView ? t("notif.archivedTitle") : guide.title}
      description={
        isArchivedView ? t("notif.archivedDescription") : guide.description
      }
      capabilities={guide.capabilities}
      actions={
        unlocked ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={exporting || loading}
            onClick={() => void handleExport()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {t("notif.exportCsv")}
          </button>
          {isArchivedView ? (
            <Link
              href={notificationsHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
            >
              <ArrowLeft size={14} />
              {t("notif.backToInbox")}
            </Link>
          ) : (
            <Link
              href={archivedHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200"
              title={t("notif.archivedLinkTitle")}
            >
              <Archive size={14} />
              {t("notif.archived")}
            </Link>
          )}
        </div>
        ) : null
      }
    >
      <FeatureGate feature="notifications" unlocked={unlocked}>
      {error ? (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      <div className="mb-4 grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-zinc-500">
          {t("notif.from")}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          {t("notif.to")}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          {t("notif.section")}
          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          >
            {NOTIFICATION_SECTION_VALUES.map((value) => (
              <option key={value} value={value}>
                {sectionLabel(value, t)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-zinc-500">
          {t("notif.status")}
          <select
            value={status}
            onChange={(e) =>
              setStatusWithUrl(e.target.value as NotificationStatus)
            }
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          >
            <option value="all">{t("notif.statusAll")}</option>
            <option value="unread">{t("notif.statusUnread")}</option>
            <option value="read">{t("notif.statusRead")}</option>
            <option value="archived">{t("notif.statusArchived")}</option>
          </select>
        </label>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          {total === 1
            ? t("notif.countOne", { total })
            : t("notif.countMany", { total })}
          {unreadCount > 0 && status !== "archived"
            ? t("notif.unreadSuffix", { unread: unreadCount })
            : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {status !== "archived" && unreadCount > 0 ? (
            <button
              type="button"
              disabled={markingAll}
              onClick={() => void handleMarkAll()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
            >
              {markingAll ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCheck size={14} />
              )}
              {t("notif.readAll")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={selectAllVisible}
            disabled={items.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
          >
            {t("notif.selectAll")}
          </button>
          {selected.size > 0 ? (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
            >
              {t("notif.clearSelection")}
            </button>
          ) : null}
          {isArchivedView ? (
            <>
              {selected.size > 0 ? (
                <button
                  type="button"
                  disabled={archiving}
                  onClick={() => void handleUnarchive({ ids: [...selected] })}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-50"
                >
                  {archiving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ArchiveRestore size={14} />
                  )}
                  {t("notif.unarchiveSelected", { n: selected.size })}
                </button>
              ) : null}
              <button
                type="button"
                disabled={archiving || items.length === 0}
                onClick={() => void handleUnarchive({ allMatching: true })}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
              >
                <ArchiveRestore size={14} />
                {t("notif.unarchiveAll")}
              </button>
            </>
          ) : (
            <>
              {selected.size > 0 ? (
                <button
                  type="button"
                  disabled={archiving}
                  onClick={() => void handleArchive({ ids: [...selected] })}
                  className="inline-flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 disabled:opacity-50"
                >
                  {archiving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Archive size={14} />
                  )}
                  {t("notif.archiveSelected", { n: selected.size })}
                </button>
              ) : null}
              <button
                type="button"
                disabled={archiving || items.length === 0}
                onClick={() => void handleArchive({ allMatching: true })}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-400/30 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
              >
                <Archive size={14} />
                {t("notif.archiveAll")}
              </button>
            </>
          )}
          {canDelete || isOwner ? (
            <>
              {selected.size > 0 ? (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleDelete({ ids: [...selected] })}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  {t("notif.deleteSelected", { n: selected.size })}
                </button>
              ) : null}
              <button
                type="button"
                disabled={deleting || items.length === 0}
                onClick={() => void handleDelete({ allMatching: true })}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-400/30 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                <Trash2 size={14} />
                {t("notif.deleteAll")}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
          <Bell className="mx-auto h-8 w-8 text-zinc-600" />
          <p className="mt-3 text-sm text-zinc-400">
            {status === "archived"
              ? t("notif.emptyArchived")
              : status === "unread"
                ? t("notif.emptyUnread")
                : t("notif.emptyAll")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => (
            <li key={row.id}>
              <NotificationItem
                row={row}
                selected={selected.has(row.id)}
                onToggleSelect={toggleSelect}
                onRead={handleRead}
                onUnread={handleUnread}
                hrefBase={hrefBase}
                showCheckboxes={showCheckboxes}
                isArchivedView={isArchivedView}
                t={t}
              />
            </li>
          ))}
        </ul>
      )}

      {isArchivedView ? (
        <p className="mt-6 flex items-center gap-2 text-xs text-zinc-600">
          <ArchiveRestore size={12} />
          {t("notif.archivedFooter")}
        </p>
      ) : (
        <p className="mt-6 flex items-center gap-2 text-xs text-zinc-600">
          <MailOpen size={12} />
          {t("notif.inboxFooter")}
        </p>
      )}
      </FeatureGate>
    </TenantPage>
  );
}
