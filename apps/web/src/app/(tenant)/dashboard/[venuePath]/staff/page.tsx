"use client";

import { Copy, Loader2, Pencil, Plus, Shield, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { TenantPage } from "@/components/layout/tenant-page";
import { StaffAccessEditor } from "@/components/staff/staff-access-editor";
import { ManagerAccessExtras } from "@/components/staff/manager-access-extras";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { cn } from "@/lib/cn";
import {
  buildManagerPerms,
  managerExtrasFromPerms,
  permsFromCsv,
} from "@/lib/dashboard-access";
import { isFeatureUnlocked } from "@/lib/plan";
import { useVenueAccess } from "@/lib/use-venue-access";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  createStaff,
  deleteStaff,
  fetchStaff,
  regenerateStaffInvite,
  updateStaff,
  type CreateStaffResponse,
  type StaffListResponse,
  type StaffMember,
} from "@/lib/staff-client";
import { hasPermission, type ShopRole } from "@/lib/auth-client";
import { staffLoginPreview, VENUE_STAFF_LOGIN_SUFFIX } from "@/lib/venue-account";
import { useVenueHref } from "@/lib/venue-context";
import Link from "next/link";

type PageTab = "accounts" | "access";

function EmployeeAccountsContent() {
  const guide = useDashboardGuide("staff");
  const { state } = useAuth();
  const subscriptionHref = useVenueHref("/subscription");
  const membership = useCurrentMembership();
  const shopSlug = membership?.shop.slug ?? "";
  const isOwner = membership?.role === "OWNER";
  const canViewStaff =
    isOwner || hasPermission(membership?.permissions ?? "", "staff.read");
  const canEditStaffFromAuth =
    isOwner || hasPermission(membership?.permissions ?? "", "staff.write");

  const [data, setData] = useState<StaffListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [createRole, setCreateRole] = useState<ShopRole>("STAFF");
  const [activationReveal, setActivationReveal] =
    useState<CreateStaffResponse | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([
    "reservation.read",
    "resource.read",
  ]);
  const [createMgrExtras, setCreateMgrExtras] = useState({
    venueSettings: false,
    subscription: false,
  });
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<ShopRole>("STAFF");
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [editMgrExtras, setEditMgrExtras] = useState({
    venueSettings: false,
    subscription: false,
  });
  const [editActive, setEditActive] = useState(true);
  const [pageTab, setPageTab] = useState<PageTab>("accounts");
  const [accessMemberId, setAccessMemberId] = useState<string | null>(null);
  const [accessPerms, setAccessPerms] = useState<string[]>([]);
  const [accessRole, setAccessRole] = useState<ShopRole>("STAFF");
  const [accessMgrExtras, setAccessMgrExtras] = useState({
    venueSettings: false,
    subscription: false,
  });
  const [accessSaving, setAccessSaving] = useState(false);

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
        role: createRole,
        permissions:
          createRole === "MANAGER"
            ? buildManagerPerms(createMgrExtras)
            : selectedPerms,
      });
      setUsername("");
      setName("");
      setCreateRole("STAFF");
      setCreateMgrExtras({ venueSettings: false, subscription: false });
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

  function openEdit(member: StaffMember) {
    setEditing(member);
    setEditName(member.name ?? "");
    setEditRole(member.role === "MANAGER" ? "MANAGER" : "STAFF");
    setEditPerms(permsFromCsv(member.permissions));
    setEditMgrExtras(managerExtrasFromPerms(permsFromCsv(member.permissions)));
    setEditActive(member.isActive);
  }

  function closeEdit() {
    setEditing(null);
    setSaving(false);
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await updateStaff(editing.membershipId, {
        name: editName.trim() || undefined,
        role: editRole,
        permissions:
          editRole === "MANAGER"
            ? buildManagerPerms(editMgrExtras)
            : editPerms,
        isActive: editActive,
      });
      closeEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update employee.");
    } finally {
      setSaving(false);
    }
  }

  function openAccessTab(member: StaffMember) {
    setAccessMemberId(member.membershipId);
    const perms = permsFromCsv(member.permissions);
    setAccessPerms(perms);
    setAccessRole(member.role === "MANAGER" ? "MANAGER" : "STAFF");
    setAccessMgrExtras(managerExtrasFromPerms(perms));
    setPageTab("access");
  }

  async function saveAccessTab() {
    if (!accessMemberId || !data?.canEditStaff) return;
    setAccessSaving(true);
    setError(null);
    try {
      await updateStaff(accessMemberId, {
        role: accessRole,
        permissions:
          accessRole === "MANAGER"
            ? buildManagerPerms(accessMgrExtras)
            : accessPerms,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save access.");
    } finally {
      setAccessSaving(false);
    }
  }

  if (!canViewStaff) {
    return (
      <TenantPage
        title={guide.title}
        description={guide.description}
        capabilities={guide.capabilities}
      >
        <p className="text-sm text-zinc-400">
          You do not have permission to view employee accounts.
        </p>
      </TenantPage>
    );
  }

  if (loading) {
    return (
      <TenantPage title={guide.title} description={guide.description}>
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </TenantPage>
    );
  }

  const seats = data?.seats ?? { used: 0, limit: 0, tier: "FREE" };
  const canCreate = data?.canCreateEmployees ?? false;
  const canEditStaff = data?.canEditStaff ?? canEditStaffFromAuth;
  const accessMember =
    data?.staff.find((m) => m.membershipId === accessMemberId) ?? null;

  return (
    <TenantPage
      title={guide.title}
      description={guide.description}
      capabilities={guide.capabilities}
      actions={
        pageTab === "accounts" && canCreate ? (
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
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-zinc-950/80 p-1 ring-1 ring-white/10">
        <button
          type="button"
          onClick={() => setPageTab("accounts")}
          className={cn(
            "rounded-lg px-3 py-2 text-xs font-medium transition-colors",
            pageTab === "accounts"
              ? "bg-emerald-500/20 text-emerald-100"
              : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
          )}
        >
          Accounts
        </button>
        {canEditStaff ? (
          <button
            type="button"
            onClick={() => setPageTab("access")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
              pageTab === "access"
                ? "bg-violet-500/20 text-violet-100"
                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
            )}
          >
            <Shield size={12} />
            Access & permissions
          </button>
        ) : null}
      </div>

      {pageTab === "access" && canEditStaff ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-violet-400/20 bg-violet-500/5 p-4">
            <h2 className="text-sm font-semibold text-violet-100">
              Control what each employee can see
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Pick a team member, then toggle dashboard sections. Hidden tabs
              disappear from their sidebar immediately after save.
            </p>
          </div>

          <label className="block text-xs text-zinc-500">
            Employee
            <select
              value={accessMemberId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setAccessMemberId(id);
                const member = data?.staff.find((m) => m.membershipId === id);
                if (member) {
                  const perms = permsFromCsv(member.permissions);
                  setAccessPerms(perms);
                  setAccessRole(member.role === "MANAGER" ? "MANAGER" : "STAFF");
                  setAccessMgrExtras(managerExtrasFromPerms(perms));
                }
              }}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white sm:max-w-md"
            >
              <option value="">Select an employee…</option>
              {(data?.staff ?? []).map((m) => (
                <option key={m.membershipId} value={m.membershipId}>
                  {m.name ?? m.loginId} ({m.role})
                </option>
              ))}
            </select>
          </label>

          {accessMember ? (
            <>
              <div className="flex flex-wrap items-end gap-4">
                <label className="block text-xs text-zinc-500">
                  Role
                  <select
                    value={accessRole}
                    onChange={(e) =>
                      setAccessRole(e.target.value as ShopRole)
                    }
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white sm:w-48"
                  >
                    <option value="STAFF">Staff</option>
                    <option value="MANAGER">Manager (admin)</option>
                  </select>
                </label>
                <p className="text-[11px] text-zinc-600">
                  {accessRole === "MANAGER"
                    ? "Managers get full ops access automatically. Audit stays owner-only."
                    : "Pick exactly which dashboard areas this person can use."}
                </p>
              </div>

              {accessRole === "MANAGER" ? (
                <ManagerAccessExtras
                  venueSettings={accessMgrExtras.venueSettings}
                  subscription={accessMgrExtras.subscription}
                  onChange={setAccessMgrExtras}
                  allowSubscriptionGrant={isOwner}
                />
              ) : (
                <StaffAccessEditor
                  perms={accessPerms}
                  onChange={setAccessPerms}
                  assignablePermissions={(
                    data?.assignablePermissions ?? []
                  ).filter((p) => p !== "subscription.manage")}
                />
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={accessSaving}
                  onClick={() => void saveAccessTab()}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {accessSaving ? "Saving…" : "Save access for this employee"}
                </button>
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-white/15 px-6 py-10 text-center text-sm text-zinc-500">
              Select an employee to configure their dashboard access.
            </p>
          )}
        </div>
      ) : (
        <>
      <div className="mb-6 rounded-xl border border-white/10 bg-zinc-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Employee seats
            </p>
            <p className="text-2xl font-semibold text-white">
              {seats.used} / {seats.limit}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {seats.limit === 0
                ? "No seats purchased yet"
                : `${seats.used} account${seats.used === 1 ? "" : "s"} · ${seats.limit} purchased`}
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
            {seats.limit === 0
              ? "Buy employee seats on Subscription (Team accounts), then create one login per seat here."
              : seats.used >= seats.limit
                ? "All purchased seats are in use. Buy more seats on Subscription to add another employee."
                : "Only the venue owner can create employee accounts."}
          </p>
        )}
        {seats.limit === 0 ? (
          <Link
            href={subscriptionHref}
            className="mt-3 inline-flex text-sm text-emerald-300 underline-offset-2 hover:underline"
          >
            Go to Subscription → add seats
          </Link>
        ) : null}
      </div>

      {activationReveal ? (
        <div className="mb-6 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-5">
          <p className="text-sm font-medium text-cyan-100">
            Send this setup link only to{" "}
            {activationReveal.name ?? activationReveal.username}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Copy and send it via WhatsApp, SMS, or any channel you trust. They
            choose their own password (same as a new account). Link expires{" "}
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

      {showForm && canCreate ? (
        <ModalPortal>
          <div className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center sm:p-4">
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setShowForm(false)}
            />
            <form
              onSubmit={onCreate}
              className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-2xl"
            >
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2">
                  <UserPlus size={16} className="text-emerald-300" />
                  <div>
                    <h2 className="text-base font-semibold text-white">
                      New employee login
                    </h2>
                    <p className="text-[11px] text-zinc-500">
                      Identity, role, then dashboard access
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-5 overflow-y-auto px-5 py-4">
                <section className="space-y-3">
                  <h3 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    1 · Identity
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs text-zinc-500">
                      Username
                      <input
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="anna"
                        pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/40"
                      />
                    </label>
                    <label className="block text-xs text-zinc-500">
                      Display name
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Anna"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40"
                      />
                    </label>
                  </div>
                  <label className="block text-xs text-zinc-500 sm:max-w-xs">
                    Role
                    <select
                      value={createRole}
                      onChange={(e) =>
                        setCreateRole(e.target.value as ShopRole)
                      }
                      className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40"
                    >
                      <option value="STAFF">Staff</option>
                      <option value="MANAGER">Manager (admin)</option>
                    </select>
                  </label>
                </section>

                <section className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-4 py-3">
                  <h3 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    2 · Login ID
                  </h3>
                  <p className="mt-1.5 font-mono text-base text-cyan-200">
                    {loginPreview}
                  </p>
                  <p className="mt-1.5 text-xs text-zinc-500">
                    Password is chosen by them via a one-time setup link you
                    hand over after creation.
                  </p>
                </section>

                <section className="space-y-3">
                  <div>
                    <h3 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      3 · Dashboard access
                    </h3>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {createRole === "MANAGER"
                        ? "Managers unlock full ops access. Optionally grant settings or billing."
                        : "Open sections and tap permissions to toggle."}
                    </p>
                  </div>
                  {createRole === "MANAGER" ? (
                    <ManagerAccessExtras
                      venueSettings={createMgrExtras.venueSettings}
                      subscription={createMgrExtras.subscription}
                      onChange={setCreateMgrExtras}
                      allowSubscriptionGrant={isOwner}
                    />
                  ) : (
                    <StaffAccessEditor
                      perms={selectedPerms}
                      onChange={setSelectedPerms}
                      assignablePermissions={(
                        data?.assignablePermissions ?? []
                      ).filter((p) => p !== "subscription.manage")}
                      compact
                    />
                  )}
                </section>
              </div>

              <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "Creating…" : "Create employee account"}
                </button>
              </div>
            </form>
          </div>
        </ModalPortal>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/10">
        {(data?.staff ?? []).some((m) => m.passwordResetRequestedAt && m.isActive) ? (
          <div className="border-b border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <p className="font-medium">Password reset requested</p>
            <p className="mt-1 text-xs text-rose-200/80">
              An employee forgot their password. Click{" "}
              <span className="font-medium text-rose-100">Send reset link</span>,
              then share the link with them on WhatsApp or another channel.
            </p>
          </div>
        ) : null}
        <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
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
            {(data?.staff ?? [])
              .slice()
              .sort((a, b) => {
                const ar = a.passwordResetRequestedAt ? 0 : 1;
                const br = b.passwordResetRequestedAt ? 0 : 1;
                return ar - br;
              })
              .map((m: StaffMember) => (
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
                  <div className="flex flex-wrap items-center gap-1.5">
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
                    {m.passwordResetRequestedAt && m.isActive ? (
                      <span
                        className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs text-rose-200"
                        title={`Requested ${new Date(m.passwordResetRequestedAt).toLocaleString()}`}
                      >
                        Forgot password
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {canEditStaff ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openAccessTab(m)}
                          className="text-xs text-violet-400 hover:text-violet-300"
                        >
                          Access
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(m)}
                          className="text-zinc-500 hover:text-emerald-300"
                          aria-label="Edit employee"
                        >
                          <Pencil size={14} />
                        </button>
                      </>
                    ) : null}
                    {isOwner && m.isActive && (m.pendingInvite || m.activated) ? (
                      <button
                        type="button"
                        onClick={() => {
                          void regenerateStaffInvite(m.membershipId).then(
                            (r) => {
                              setActivationReveal({
                                ...m,
                                activationUrl: r.activationUrl,
                                activationExpiresAt: r.activationExpiresAt,
                              } as CreateStaffResponse);
                              void load();
                            },
                          );
                        }}
                        className={cn(
                          "text-xs",
                          m.passwordResetRequestedAt
                            ? "font-medium text-rose-300 hover:text-rose-200"
                            : "text-cyan-400 hover:text-cyan-300",
                        )}
                      >
                        {m.passwordResetRequestedAt
                          ? "Send reset link"
                          : m.pendingInvite
                            ? "New link"
                            : "Reset link"}
                      </button>
                    ) : null}
                    {isOwner ? (
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
                    ) : null}
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
      </div>

      {editing && canEditStaff ? (
        <ModalPortal>
          <div className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center sm:p-4">
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={closeEdit}
            />
            <form
              onSubmit={onSaveEdit}
              className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-2xl"
            >
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Edit employee
                  </h2>
                  <p className="mt-0.5 font-mono text-xs text-cyan-200">
                    {editing.loginId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="text-zinc-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-5 overflow-y-auto px-5 py-4">
                <section className="space-y-3">
                  <h3 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Profile
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs text-zinc-500">
                      Display name
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40"
                      />
                    </label>
                    <label className="block text-xs text-zinc-500">
                      Role
                      <select
                        value={editRole}
                        onChange={(e) =>
                          setEditRole(e.target.value as ShopRole)
                        }
                        className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40"
                      >
                        <option value="STAFF">Staff</option>
                        <option value="MANAGER">Manager</option>
                      </select>
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    Account active — uncheck to suspend without deleting
                  </label>
                </section>

                <section className="space-y-3">
                  <div>
                    <h3 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      Dashboard access
                    </h3>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {editRole === "MANAGER"
                        ? "Full ops access is automatic. Optional grants below."
                        : "Open sections and select permissions."}
                    </p>
                  </div>
                  {editRole === "MANAGER" ? (
                    <ManagerAccessExtras
                      venueSettings={editMgrExtras.venueSettings}
                      subscription={editMgrExtras.subscription}
                      onChange={setEditMgrExtras}
                      allowSubscriptionGrant={isOwner}
                    />
                  ) : (
                    <StaffAccessEditor
                      perms={editPerms}
                      onChange={setEditPerms}
                      assignablePermissions={(
                        data?.assignablePermissions ?? []
                      ).filter((p) => p !== "subscription.manage")}
                      compact
                    />
                  )}
                </section>
              </div>

              <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </ModalPortal>
      ) : null}
        </>
      )}
    </TenantPage>
  );
}

export default function StaffPage() {
  const access = useVenueAccess();
  const unlocked = isFeatureUnlocked(access.enabledModules, "roles");

  return (
    <FeatureGate feature="roles" unlocked={unlocked} title="Employee accounts">
      <EmployeeAccountsContent />
    </FeatureGate>
  );
}
