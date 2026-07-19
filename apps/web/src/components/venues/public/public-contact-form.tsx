"use client";

import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { submitPublicVenueContact } from "@/lib/public-guest-client";

export function PublicContactForm({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!guestName.trim()) {
      setError("Your name is required.");
      return;
    }
    if (!message.trim()) {
      setError("Please write a message.");
      return;
    }
    if (!guestEmail.trim() && !guestPhone.trim()) {
      setError("Provide an email or phone so the venue can reply.");
      return;
    }

    setBusy(true);
    try {
      const res = await submitPublicVenueContact(slug, {
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim() || undefined,
        guestPhone: guestPhone.trim() || undefined,
        subject: subject.trim() || undefined,
        message: message.trim(),
      });
      setSuccess(res.message);
      setGuestName("");
      setGuestEmail("");
      setGuestPhone("");
      setSubject("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div
        className={cn(
          "rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-6 text-center",
          className,
        )}
      >
        <CheckCircle2 className="mx-auto text-emerald-400" size={32} />
        <p className="mt-3 text-sm font-medium text-emerald-100">{success}</p>
        <button
          type="button"
          onClick={() => setSuccess(null)}
          className="mt-4 text-xs text-emerald-300 underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className={cn(
        "rounded-xl border border-white/10 bg-zinc-900/80 p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 shrink-0 text-sky-300" size={22} />
        <div>
          <h3 className="text-lg font-semibold text-white">Contact the venue</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Questions, group inquiries, or anything that is not a booking request.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-zinc-400">
          Your name
          <input
            required
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-base text-white sm:text-sm"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Subject
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-base text-white sm:text-sm"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Phone
          <input
            type="tel"
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-base text-white sm:text-sm"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Email
          <input
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-base text-white sm:text-sm"
          />
        </label>
        <label className="block text-xs text-zinc-400 sm:col-span-2">
          Message
          <textarea
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-base text-white sm:text-sm"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50 sm:w-auto sm:px-6"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : null}
        Send message
      </button>
    </form>
  );
}
