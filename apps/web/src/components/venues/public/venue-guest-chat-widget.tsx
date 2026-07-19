"use client";

import {
  Bell,
  Loader2,
  MessageCircle,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  clearGuestChatToken,
  createPublicGuestChat,
  deletePublicGuestChat,
  endPublicGuestChat,
  fetchPublicGuestChat,
  pingPublicGuestChat,
  readGuestChatToken,
  sendPublicGuestChatMessage,
  writeGuestChatToken,
  type GuestChat,
} from "@/lib/guest-chat-client";
import { useLiveData } from "@/lib/use-live-data";

function statusLabel(status: GuestChat["status"]) {
  switch (status) {
    case "WAITING":
      return "Waiting for staff…";
    case "OPEN":
      return "Connected with staff";
    case "PAUSED":
      return "Chat paused";
    case "ENDED":
      return "Chat ended";
    default:
      return status;
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function VenueGuestChatWidget({
  slug,
  venueName,
}: {
  slug: string;
  venueName: string;
}) {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<GuestChat | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [draft, setDraft] = useState("");

  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chat?.messages.length, open, scrollToBottom]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = readGuestChatToken(slug);
      if (!stored) {
        if (!cancelled) setBootstrapping(false);
        return;
      }
      try {
        const data = await fetchPublicGuestChat(slug, stored);
        if (cancelled) return;
        setToken(stored);
        setChat(data);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 404 || e.status === 400)) {
          clearGuestChatToken(slug);
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchPublicGuestChat(slug, token);
      setChat(data);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        clearGuestChatToken(slug);
        setToken(null);
        setChat(null);
      }
    }
  }, [slug, token]);

  useLiveData(() => refresh(), [refresh], {
    enabled: open && !!token && chat?.status !== "ENDED",
    intervalMs: 4_000,
  });

  const startChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await createPublicGuestChat(slug, {
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim() || undefined,
        guestPhone: guestPhone.trim() || undefined,
        message: firstMessage.trim() || undefined,
      });
      writeGuestChatToken(slug, res.guestToken);
      setToken(res.guestToken);
      setChat(res.chat);
      setFirstMessage("");
      setNotice(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start chat.");
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const msg = await sendPublicGuestChatMessage(slug, token, draft.trim());
      setDraft("");
      setChat((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, msg], updatedAt: msg.createdAt }
          : prev,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  };

  const pingStaff = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await pingPublicGuestChat(slug, token);
      setNotice(res.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not notify staff.");
    } finally {
      setBusy(false);
    }
  };

  const endChat = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const data = await endPublicGuestChat(slug, token);
      setChat(data);
      setNotice("You ended this chat.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not end chat.");
    } finally {
      setBusy(false);
    }
  };

  const removeChat = async () => {
    if (!token) return;
    if (!window.confirm("Delete this chat? You won’t be able to reopen it.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deletePublicGuestChat(slug, token);
      clearGuestChatToken(slug);
      setToken(null);
      setChat(null);
      setNotice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete chat.");
    } finally {
      setBusy(false);
    }
  };

  const canType = chat?.canGuestChat ?? false;
  const canPing = chat?.canGuestPing ?? false;
  const hasActive = !!chat && chat.status !== "ENDED";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed z-40 inline-flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold shadow-lg transition",
          "bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))]",
          "border-emerald-400/40 bg-emerald-600 text-white hover:bg-emerald-500",
          open && "ring-2 ring-emerald-300/40",
        )}
        aria-expanded={open}
      >
        <MessageCircle size={18} />
        {hasActive ? "Continue chat" : "Chat with staff"}
        {chat?.status === "WAITING" ? (
          <span className="size-2 animate-pulse rounded-full bg-amber-300" />
        ) : null}
      </button>

      {open ? (
        <div className="fixed bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] right-[max(1.25rem,env(safe-area-inset-right))] z-40 flex h-[min(32rem,calc(100dvh-6rem))] w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-white/15 bg-zinc-950 shadow-2xl">
          <header className="flex items-start justify-between gap-2 border-b border-white/10 bg-zinc-900/80 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {venueName}
              </p>
              <p className="text-[11px] text-zinc-400">
                {bootstrapping
                  ? "Loading…"
                  : chat
                    ? statusLabel(chat.status)
                    : "Private chat with venue staff"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
              aria-label="Close chat"
            >
              <X size={16} />
            </button>
          </header>

          <div ref={scrollerRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {bootstrapping ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
              </div>
            ) : !chat ? (
              <form onSubmit={startChat} className="space-y-3">
                <p className="text-xs leading-relaxed text-zinc-400">
                  Start a private chat. Only you and venue staff can see it —
                  it stays available after refresh until you or staff end or
                  delete it.
                </p>
                <label className="block space-y-1">
                  <span className="text-[11px] text-zinc-500">Your name</span>
                  <input
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50"
                    maxLength={120}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] text-zinc-500">
                    Email (optional)
                  </span>
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50"
                    maxLength={200}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] text-zinc-500">
                    Phone (optional)
                  </span>
                  <input
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50"
                    maxLength={40}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] text-zinc-500">
                    First message (optional)
                  </span>
                  <textarea
                    value={firstMessage}
                    onChange={(e) => setFirstMessage(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50"
                    maxLength={2000}
                    placeholder="How can we help?"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || !guestName.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageCircle size={16} />
                  )}
                  Start chat
                </button>
              </form>
            ) : (
              <>
                {chat.status === "WAITING" ? (
                  <div className="rounded-lg border border-amber-400/20 bg-amber-950/40 px-3 py-2 text-xs text-amber-100/90">
                    You’re in the queue. A staff member will join shortly.
                  </div>
                ) : null}
                {chat.status === "PAUSED" ? (
                  <div className="rounded-lg border border-amber-400/20 bg-amber-950/40 px-3 py-2 text-xs text-amber-100/90">
                    Staff paused this chat. You can still message or notify them.
                  </div>
                ) : null}
                {chat.messages.map((m) => {
                  const mine = m.sender === "GUEST";
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex",
                        mine ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                          mine
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
                            mine ? "text-emerald-100/70" : "text-zinc-500",
                          )}
                        >
                          {mine ? "You" : "Staff"} · {formatTime(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {chat.messages.length === 0 ? (
                  <p className="py-6 text-center text-xs text-zinc-500">
                    No messages yet — say hello when you’re ready.
                  </p>
                ) : null}
              </>
            )}
          </div>

          {error ? (
            <p className="border-t border-rose-500/20 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="border-t border-emerald-500/20 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
              {notice}
            </p>
          ) : null}

          {chat ? (
            <div className="border-t border-white/10 bg-zinc-900/60 p-2">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {canPing ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void pingStaff()}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:border-amber-400/40 hover:text-amber-200 disabled:opacity-50"
                  >
                    <Bell size={12} />
                    Notify staff
                  </button>
                ) : null}
                {chat.status !== "ENDED" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void endChat()}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:text-zinc-100 disabled:opacity-50"
                  >
                    End chat
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeChat()}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-400 hover:border-rose-400/40 hover:text-rose-300 disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
              {canType ? (
                <form onSubmit={sendMessage} className="flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                      chat.status === "WAITING"
                        ? "Message while you wait…"
                        : "Type a message…"
                    }
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50"
                    maxLength={2000}
                    disabled={busy}
                  />
                  <button
                    type="submit"
                    disabled={busy || !draft.trim()}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 text-white hover:bg-emerald-500 disabled:opacity-50"
                    aria-label="Send"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </form>
              ) : (
                <p className="px-1 py-1 text-[11px] text-zinc-500">
                  This chat has ended. Delete it to start a new one, or ask
                  staff to reopen.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
