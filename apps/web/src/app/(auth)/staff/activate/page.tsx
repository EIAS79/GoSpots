"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { activateStaffAccount } from "@/lib/staff-client";

function ActivateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Missing setup link. Ask your manager for a new invite.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await activateStaffAccount(token, password);
      if (res.dashboardPath) {
        router.replace(`/dashboard/${res.dashboardPath}`);
      } else {
        router.replace("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title="Invalid setup link" subtitle="This page needs a token from your manager.">
        <p className="text-sm text-zinc-400">
          Open the personal setup link you received — do not share it with coworkers.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm text-emerald-400 hover:underline">
          Go to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Set up your employee login"
      subtitle="Choose a password only you know. Your manager never sees it."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-xs text-zinc-500">
          New password (min 10 characters)
          <input
            type="password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          Confirm password
          <input
            type="password"
            required
            minLength={10}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
        </label>
        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Activating…
            </span>
          ) : (
            "Activate & sign in"
          )}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-zinc-600">
        One account = one person. Signing in elsewhere will end your other session.
      </p>
    </AuthCard>
  );
}

export default function StaffActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      }
    >
      <div className="flex min-h-screen items-center justify-center px-4 py-16">
        <ActivateForm />
      </div>
    </Suspense>
  );
}
