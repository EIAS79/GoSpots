"use client";

import { Copy, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { TenantPage } from "@/components/layout/tenant-page";
import { DASHBOARD_SECTION_GUIDES } from "@/lib/dashboard-section-guides";
import { useAuth } from "@/lib/use-auth";

const GUIDE = DASHBOARD_SECTION_GUIDES.staff;
import { cn } from "@/lib/cn";
import {
  isFeatureUnlocked,
  resolveEffectiveTier,
  type SubscriptionTier,
} from "@/lib/plan";
import {
  createStaff,
  deleteStaff,
  fetchStaff,
  regenerateStaffInvite,
  type CreateStaffResponse,
  type StaffListResponse,
  type StaffMember,
} from "@/lib/staff-client";
import { staffLoginPreview, VENUE_STAFF_LOGIN_SUFFIX } from "@/lib/venue-account";

const PERM_LABELS: Record<string, string> = {
  "menu.read": "View menu",
  "menu.write": "Edit menu",
  "resource.read": "View games & units",
  "resource.write": "Manage games & units",
  "reservation.read": "View reservations",
  "reservation.write": "Manage reservations",
  "transaction.read": "View sales",
  "transaction.write": "Record sales",
  "gallery.read": "View gallery",
  "gallery.write": "Edit gallery",
  "hours.write": "Opening hours",
};

function EmployeeAccountsContent() {
  const { state } = useAuth();
  const shopSlug =
    state.status === "authed"
      ? state.user.memberships[0]?.shop.slug ?? ""
      : "";
  const isOwner =
    state.status === "authed" &&
    state.user.memberships.some((m) => m.role === "OWNER");

  const [data, setData] = useState<StaffListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [activationReveal, setActivationReveal] =
    useState<CreateStaffResponse | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([
    "reservation.read",
    "resource.read",
  ]);

  const loginPreview = staffLoginPreview(username, shopSlug);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchStaff());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await createStaff({
        username,
        name: name || undefined,
        role: "STAFF",
        permissions: selectedPerms,
      });
      setUsername("");
      setName("");
      setShowForm(false);
      setActivationReveal(created);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLogin(loginId: string, id: string) {
    await navigator.clipboard.writeText(loginId);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (!isOwner) {
    return (
      <TenantPage
        title={GUIDE.title}
        description={GUIDE.description}
        capabilities={GUIDE.capabilities}
      >
        <p className="text-sm text-zinc-400">
          Only the venue owner can create employee logins.
        </p>
      </TenantPage>
    );
  }

  if (loading) {
    return (
      <TenantPage title={GUIDE.title} description={GUIDE.description}>
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </TenantPage>
    );
  }

  const seats = data?.seats ?? { used: 0, limit: 0, tier: "FREE" };
  const canCreate = data?.canCreateEmployees ?? false;

  return (
    <TenantPage
      title={GUIDE.title}
      description={GUIDE.description}
      capabilities={GUIDE.capabilities}
      actions={
        canCreate ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500"
          >
            <Plus size={14} />
            Create account
          </button>
        ) : null
      }
    >
      <div className="mb-6 rounded-xl border border-white/10 bg-zinc-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Seats ({seats.tier} plan)
            </p>
            <p className="text-2xl font-semibold text-white">
              {seats.used} / {seats.limit}
            </p>
          </div>
          <div className="text-right text-sm text-zinc-400">
            <p>Login format</p>
            <p className="font-mono text-emerald-300">
              username@{shopSlug || "venue"}
              {VENUE_STAFF_LOGIN_SUFFIX}
            </p>
          </div>
        </div>
        {data?.seatPolicy ? (
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            {data.seatPolicy}
          </p>
        ) : null}
        {!canCreate && (
          <p className="mt-3 text-sm text-amber-200/90">
            Employee accounts require Pro. Each seat is one person with their own
            password — sharing logins is blocked.
          </p>
        )}
      </div>

      {activationReveal ? (
        <div className="mb-6 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-5">
          <p className="text-sm font-medium text-cyan-100">
            Send this setup link only to {activationReveal.name ?? activationReveal.username}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            They choose their own password. Link expires{" "}
            {new Date(activationReveal.activationExpiresAt).toLocaleString()}.
          </p>
          <p className="mt-3 break-all font-mono text-xs text-cyan-200">
            {activationReveal.activationUrl}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard.writeText(activationReveal.activationUrl)
              }
              className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs text-white"
            >
              Copy setup link
            </button>
            <button
              type="button"
              onClick={() => setActivationReveal(null)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {error && (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      {showForm && canCreate && (
        <form
          onSubmit={onCreate}
          className="mb-6 space-y-4 rounded-xl border border-emerald-400/25 bg-emerald-500/5 p-5"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
            <UserPlus size={16} />
            New employee login
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-xs text-zinc-500">
              Username
              <input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="anna"
                pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}"
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 font-mono text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Display name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Anna"
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>

          <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 px-4 py-3 md:col-span-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              After creation — login ID (password is chosen by them)
            </p>
            <p className="mt-1 font-mono text-base text-cyan-200">{loginPreview}</p>
            <p className="mt-2 text-xs text-zinc-500">
              You will get a one-time setup link to hand to this person only.
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs text-zinc-500">Permissions</p>
            <div className="flex flex-wrap gap-2">
              {(data?.assignablePermissions ?? []).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    setSelectedPerms((prev) =>
                      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                    )
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition",
                    selectedPerms.includes(p)
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                      : "border-white/10 text-zinc-500",
                  )}
                >
                  {PERM_LABELS[p] ?? p}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create employee account"}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-900/80 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Login ID</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(data?.staff ?? []).map((m: StaffMember) => (
              <tr key={m.membershipId} className="bg-zinc-950/40">
                <td className="px-4 py-3 text-zinc-200">{m.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-cyan-200">{m.loginId}</span>
                  <button
                    type="button"
                    onClick={() => void copyLogin(m.loginId, m.membershipId)}
                    className="ml-2 inline-flex text-zinc-500 hover:text-white"
                    title="Copy login"
                  >
                    <Copy size={12} />
                  </button>
                  {copiedId === m.membershipId && (
                    <span className="ml-1 text-[10px] text-emerald-400">Copied</span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-400">{m.role}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      !m.isActive
                        ? "bg-zinc-700 text-zinc-400"
                        : m.activated
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-200",
                    )}
                  >
                    {!m.isActive
                      ? "Disabled"
                      : m.activated
                        ? "Active"
                        : "Pending setup"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {m.pendingInvite && m.isActive ? (
                      <button
                        type="button"
                        onClick={() => {
                          void regenerateStaffInvite(m.membershipId).then(
                            (r) => setActivationReveal({
                              ...m,
                              activationUrl: r.activationUrl,
                              activationExpiresAt: r.activationExpiresAt,
                            } as CreateStaffResponse),
                          );
                        }}
                        className="text-xs text-cyan-400 hover:text-cyan-300"
                      >
                        New link
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          !confirm(
                            `Remove ${m.loginId}? They lose access immediately.`,
                          )
                        )
                          return;
                        void deleteStaff(m.membershipId).then(load);
                      }}
                      className="text-zinc-500 hover:text-rose-400"
                      aria-label="Remove employee"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(data?.staff ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  No employee accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </TenantPage>
  );
}

export default function StaffPage() {
  const { state } = useAuth();
  const sub =
    state.status === "authed"
      ? state.user.memberships[0]?.shop.subscription
      : null;
  const tier = resolveEffectiveTier(
    sub
      ? {
          tier: sub.tier as SubscriptionTier,
          status: sub.status as "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED",
          trialEndsAt: sub.trialEndsAt,
        }
      : null,
  );
  const unlocked = isFeatureUnlocked(tier, "roles");

  return (
    <FeatureGate feature="roles" unlocked={unlocked} title="Employee accounts">
      <EmployeeAccountsContent />
    </FeatureGate>
  );
}
