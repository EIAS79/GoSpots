"use client";

import {
  ChevronLeft,
  Loader2,
  Mail,
  MessageSquare,
  Pause,
  Phone,
  Play,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TenantPage } from "@/components/layout/tenant-page";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { hasPermission } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import {
  fetchContactMessages,
  type ContactMessageRow,
} from "@/lib/contact-messages-client";
import type { GuestChat, GuestChatStatus } from "@/lib/guest-chat-client";
import {
  deleteGuestChat,
  fetchGuestChat,
  fetchGuestChats,
  joinGuestChat,
  sendStaffGuestChatMessage,
  setGuestChatStatus,
  type StaffGuestChatListItem,
} from "@/lib/staff-guest-chat-client";
import { isFeatureUnlocked } from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useLiveData } from "@/lib/use-live-data";
import { useVenueAccess } from "@/lib/use-venue-access";

const FILTERS: { id: "ALL" | GuestChatStatus; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "WAITING", label: "Waiting" },
  { id: "OPEN", label: "Open" },
  { id: "PAUSED", label: "Paused" },
  { id: "ENDED", label: "Ended" },
];

type InboxTab = "chats" | "contact";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: GuestChatStatus) {
  switch (status) {
    case "WAITING":
      return "border-amber-400/30 bg-amber-950/50 text-amber-200";
    case "OPEN":
      return "border-emerald-400/30 bg-emerald-950/50 text-emerald-200";
    case "PAUSED":
      return "border-sky-400/30 bg-sky-950/50 text-sky-200";
    case "ENDED":
      return "border-white/10 bg-zinc-900 text-zinc-400";
    default:
      return "border-white/10 text-zinc-400";
  }
}

function statusToneLabel(status: GuestChatStatus) {
  switch (status) {
    case "WAITING":
      return "Guest waiting for staff";
    case "OPEN":
      return "Live chat";
    case "PAUSED":
      return "Paused";
    case "ENDED":
      return "Ended";
    default:
      return status;
  }
}

function ActionBtn({
  children,
  onClick,
  disabled,
  icon,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium disabled:opacity-50",
        danger
          ? "border-rose-400/30 text-rose-300 hover:bg-rose-950/40"
          : "border-white/10 text-zinc-300 hover:bg-white/5",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function ContactInboxPanel({ canView }: { canView: boolean }) {
  const [items, setItems] = useState<ContactMessageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchContactMessages({ take: 100 });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages.");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  useLiveData(() => load({ silent: true }), [load], {
    enabled: canView,
    intervalMs: 15_000,
    refreshOnSections: ["messaging", "notifications"],
  });

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-rose-300">{error}</p>;
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-10 text-center text-sm text-zinc-500">
        No contact form messages yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-zinc-500">
        {total} message{total === 1 ? "" : "s"} from the public contact form
      </p>
      <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40">
        {items.map((row) => (
          <li key={row.id} className="px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-white">{row.guestName}</p>
                {row.subject ? (
                  <p className="mt-0.5 text-xs text-zinc-400">{row.subject}</p>
                ) : null}
              </div>
              <p className="text-[10px] text-zinc-600">
                {formatWhen(row.createdAt)}
              </p>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">
              {row.message}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {row.guestEmail ? (
                <a
                  href={`mailto:${row.guestEmail}`}
                  className="inline-flex items-center gap-1 text-zinc-400 hover:text-emerald-300"
                >
                  <Mail size={12} />
                  {row.guestEmail}
                </a>
              ) : null}
              {row.guestPhone ? (
                <a
                  href={`tel:${row.guestPhone}`}
                  className="inline-flex items-center gap-1 text-zinc-400 hover:text-emerald-300"
                >
                  <Phone size={12} />
                  {row.guestPhone}
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessagesPageInner() {
  const { state } = useAuth();
  const searchParams = useSearchParams();
  const membership = useCurrentMembership();
  const access = useVenueAccess();
  const guide = useDashboardGuide("messages");
  const unlocked = isFeatureUnlocked(access.enabledModules, "messaging");
  const canView =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      hasPermission(membership?.permissions ?? "", "shop.manage") ||
      hasPermission(membership?.permissions ?? "", "messaging.read") ||
      hasPermission(membership?.permissions ?? "", "notifications.read"));
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      hasPermission(membership?.permissions ?? "", "shop.manage") ||
      hasPermission(membership?.permissions ?? "", "messaging.write"));

  const [inboxTab, setInboxTab] = useState<InboxTab>(() =>
    searchParams.get("inbox") === "contact" ? "contact" : "chats",
  );
  const [filter, setFilter] = useState<"ALL" | GuestChatStatus>("ALL");
  const [items, setItems] = useState<StaffGuestChatListItem[]>([]);
  const [waitingCount, setWaitingCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => searchParams.get("chat"),
  );
  const [mobileView, setMobileView] = useState<"list" | "thread">(() =>
    searchParams.get("chat") ? "thread" : "list",
  );
  const [chat, setChat] = useState<GuestChat | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoadingList(true);
      setError(null);
      try {
        const data = await fetchGuestChats({
          status: filter === "ALL" ? undefined : filter,
          take: 100,
        });
        setItems(data.items);
        setTotal(data.total);
        setWaitingCount(data.waitingCount);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load chats.");
      } finally {
        if (!opts?.silent) setLoadingList(false);
      }
    },
    [filter],
  );

  const loadChat = useCallback(
    async (id: string, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoadingChat(true);
      try {
        const data = await fetchGuestChat(id);
        setChat(data);
      } catch (e) {
        if (!opts?.silent) {
          setChat(null);
          setError(e instanceof Error ? e.message : "Could not load chat.");
        }
      } finally {
        if (!opts?.silent) setLoadingChat(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (canView && inboxTab === "chats") void loadList();
  }, [canView, loadList, inboxTab]);

  useEffect(() => {
    if (canView && selectedId && inboxTab === "chats") void loadChat(selectedId);
    else if (inboxTab !== "chats") setChat(null);
  }, [canView, selectedId, loadChat, inboxTab]);

  useLiveData(() => loadList({ silent: true }), [loadList], {
    enabled: canView && inboxTab === "chats",
    intervalMs: 8_000,
    refreshOnSections: ["messaging", "notifications"],
  });

  useLiveData(
    () => {
      if (selectedId) void loadChat(selectedId, { silent: true });
    },
    [selectedId, loadChat],
    {
      enabled: canView && inboxTab === "chats" && !!selectedId,
      intervalMs: 3_500,
    },
  );

  const sortedItems = useMemo(() => {
    const rank: Record<GuestChatStatus, number> = {
      WAITING: 0,
      OPEN: 1,
      PAUSED: 2,
      ENDED: 3,
    };
    return [...items].sort((a, b) => {
      const d = rank[a.status] - rank[b.status];
      if (d !== 0) return d;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [items]);

  const runAction = async (fn: () => Promise<unknown>) => {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (selectedId) await loadChat(selectedId);
      await loadList({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !draft.trim() || !canWrite) return;
    setBusy(true);
    setError(null);
    try {
      await sendStaffGuestChatMessage(selectedId, draft.trim());
      setDraft("");
      await loadChat(selectedId);
      await loadList({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  };

  if (!canView) {
    return (
      <TenantPage title={guide.title} description={guide.description}>
        <p className="text-sm text-zinc-500">
          You do not have permission to view guest messages.
        </p>
      </TenantPage>
    );
  }

  return (
    <TenantPage
      title={guide.title}
      description={guide.description}
      capabilities={guide.capabilities}
    >
      <FeatureGate feature="messaging" unlocked={unlocked} title={guide.title}>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setInboxTab("chats")}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
            inboxTab === "chats"
              ? "border-emerald-400/40 bg-emerald-950/40 text-emerald-200"
              : "border-white/10 text-zinc-400 hover:text-zinc-200",
          )}
        >
          Guest chat
          {waitingCount > 0 ? ` (${waitingCount})` : null}
        </button>
        <button
          type="button"
          onClick={() => setInboxTab("contact")}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
            inboxTab === "contact"
              ? "border-sky-400/40 bg-sky-950/40 text-sky-200"
              : "border-white/10 text-zinc-400 hover:text-zinc-200",
          )}
        >
          Contact form
        </button>
      </div>

      {inboxTab === "contact" ? (
        <ContactInboxPanel canView={canView} />
      ) : (
        <>
          {error ? (
            <p className="mb-3 text-sm text-rose-300">{error}</p>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                  filter === f.id
                    ? "border-emerald-400/40 bg-emerald-950/40 text-emerald-200"
                    : "border-white/10 text-zinc-400 hover:text-zinc-200",
                )}
              >
                {f.label}
                {f.id === "WAITING" && waitingCount > 0
                  ? ` (${waitingCount})`
                  : null}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-zinc-500">
              {total} chat{total === 1 ? "" : "s"}
            </span>
          </div>

          <div className="grid gap-3 lg:min-h-[28rem] lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <aside
              className={cn(
                "overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40",
                mobileView === "thread" && "hidden lg:block",
              )}
            >
              {loadingList ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                </div>
              ) : sortedItems.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-zinc-500">
                  No chats in this filter.
                </p>
              ) : (
                <ul className="max-h-[70vh] divide-y divide-white/5 overflow-y-auto">
                  {sortedItems.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(row.id);
                          setMobileView("thread");
                        }}
                        className={cn(
                          "w-full px-3 py-3 text-left transition hover:bg-white/[0.03]",
                          selectedId === row.id && "bg-white/[0.05]",
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-white">
                            {row.guestName}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              statusTone(row.status),
                            )}
                          >
                            {row.status}
                          </span>
                        </div>
                        <p className="truncate text-xs text-zinc-500">
                          {row.lastMessage?.body ?? "No messages yet"}
                        </p>
                        <p className="mt-1 text-[10px] text-zinc-600">
                          {formatWhen(row.updatedAt)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <section
              className={cn(
                "flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40 lg:min-h-[28rem]",
                mobileView === "list" && "hidden lg:flex",
              )}
            >
              {!selectedId ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-zinc-500">
                  <MessageSquare className="h-8 w-8 opacity-40" />
                  Select a chat to reply.
                </div>
              ) : loadingChat && !chat ? (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                </div>
              ) : chat ? (
                <>
                  <header className="border-b border-white/10 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <button
                          type="button"
                          onClick={() => setMobileView("list")}
                          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-zinc-400 lg:hidden"
                          aria-label="Back to chat list"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <div className="min-w-0">
                        <h2 className="text-base font-semibold text-white">
                          {chat.guestName}
                        </h2>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {statusToneLabel(chat.status)}
                          {chat.endedAt
                            ? ` · ended ${formatWhen(chat.endedAt)}`
                            : null}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {chat.guestEmail ? (
                            <a
                              href={`mailto:${chat.guestEmail}`}
                              className="inline-flex items-center gap-1 text-zinc-400 hover:text-emerald-300"
                            >
                              <Mail size={12} />
                              {chat.guestEmail}
                            </a>
                          ) : null}
                          {chat.guestPhone ? (
                            <a
                              href={`tel:${chat.guestPhone}`}
                              className="inline-flex items-center gap-1 text-zinc-400 hover:text-emerald-300"
                            >
                              <Phone size={12} />
                              {chat.guestPhone}
                            </a>
                          ) : null}
                        </div>
                        </div>
                      </div>
                      {canWrite ? (
                        <div className="flex flex-wrap gap-1.5">
                          {chat.status === "WAITING" ? (
                            <ActionBtn
                              disabled={busy}
                              onClick={() =>
                                void runAction(() => joinGuestChat(chat.id))
                              }
                              icon={<UserPlus size={13} />}
                            >
                              Join
                            </ActionBtn>
                          ) : null}
                          {chat.status === "OPEN" || chat.status === "WAITING" ? (
                            <ActionBtn
                              disabled={busy}
                              onClick={() =>
                                void runAction(() =>
                                  setGuestChatStatus(chat.id, "PAUSED"),
                                )
                              }
                              icon={<Pause size={13} />}
                            >
                              Pause
                            </ActionBtn>
                          ) : null}
                          {chat.status === "PAUSED" || chat.status === "ENDED" ? (
                            <ActionBtn
                              disabled={busy}
                              onClick={() =>
                                void runAction(() =>
                                  setGuestChatStatus(chat.id, "OPEN"),
                                )
                              }
                              icon={<Play size={13} />}
                            >
                              {chat.status === "ENDED" ? "Reopen" : "Resume"}
                            </ActionBtn>
                          ) : null}
                          {chat.status !== "ENDED" ? (
                            <ActionBtn
                              disabled={busy}
                              onClick={() =>
                                void runAction(() =>
                                  setGuestChatStatus(chat.id, "ENDED"),
                                )
                              }
                              icon={<XCircle size={13} />}
                            >
                              End
                            </ActionBtn>
                          ) : null}
                          <ActionBtn
                            disabled={busy}
                            danger
                            onClick={() => {
                              if (
                                !window.confirm("Delete this chat permanently?")
                              ) {
                                return;
                              }
                              void runAction(async () => {
                                await deleteGuestChat(chat.id);
                                setSelectedId(null);
                                setChat(null);
                              });
                            }}
                            icon={<Trash2 size={13} />}
                          >
                            Delete
                          </ActionBtn>
                        </div>
                      ) : null}
                    </div>
                  </header>

                  <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                    {chat.messages.map((m) => {
                      const staff = m.sender === "STAFF";
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "flex",
                            staff ? "justify-end" : "justify-start",
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                              staff
                                ? "rounded-br-md bg-emerald-600 text-white"
                                : "rounded-bl-md bg-zinc-800 text-zinc-100",
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words">
                              {m.body}
                            </p>
                            <p
                              className={cn(
                                "mt-1 text-[10px]",
                                staff ? "text-emerald-100/70" : "text-zinc-500",
                              )}
                            >
                              {staff ? "Staff" : chat.guestName} ·{" "}
                              {formatTime(m.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {chat.messages.length === 0 ? (
                      <p className="py-8 text-center text-xs text-zinc-500">
                        No messages yet.
                      </p>
                    ) : null}
                  </div>

                  {canWrite && chat.status !== "ENDED" ? (
                    <form
                      onSubmit={send}
                      className="flex gap-2 border-t border-white/10 p-3"
                    >
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={
                          chat.status === "WAITING"
                            ? "Join by sending a reply…"
                            : "Reply to guest…"
                        }
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50"
                        maxLength={2000}
                        disabled={busy}
                      />
                      <button
                        type="submit"
                        disabled={busy || !draft.trim()}
                        className="rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        Send
                      </button>
                    </form>
                  ) : chat.status === "ENDED" ? (
                    <p className="border-t border-white/10 px-4 py-3 text-xs text-zinc-500">
                      Chat ended. Reopen to continue messaging.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="flex flex-1 items-center justify-center text-sm text-zinc-500">
                  Chat not found.
                </p>
              )}
            </section>
          </div>
        </>
      )}
      </FeatureGate>
    </TenantPage>
  );
}

function MessagesPageFallback() {
  const guide = useDashboardGuide("messages");
  return (
    <TenantPage title={guide.title} description={guide.description}>
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    </TenantPage>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<MessagesPageFallback />}>
      <MessagesPageInner />
    </Suspense>
  );
}
