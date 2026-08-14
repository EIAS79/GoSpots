"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";

type OrganizationShop = {
  id: string;
  name: string;
  venuePath: string | null;
  currency: string | null;
  timezone: string | null;
  branchCode: string | null;
  sharedCatalogEnabled: boolean;
  operationalAccess: boolean;
  operationalRole: string | null;
};

type Organization = {
  id: string;
  name: string;
  slug: string;
  role: string;
  accessMode: string;
  shops: OrganizationShop[];
};

type OrganizationList = { organizations: Organization[] };
type Analytics = {
  from: string;
  to: string;
  comparableCurrency: string | null;
  totals: { netRevenue: string | null };
  shops: Array<{ id: string; name: string; currency: string; netRevenue: string }>;
};

export function OrganizationWorkspace() {
  const [data, setData] = useState<OrganizationList>({ organizations: [] });
  const [selectedId, setSelectedId] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [shopId, setShopId] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("ANALYST");
  const [accessMode, setAccessMode] = useState("EXPLICIT");

  const selected = useMemo(
    () => data.organizations.find((item) => item.id === selectedId) ?? data.organizations[0] ?? null,
    [data, selectedId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.get<OrganizationList>("/organizations");
      setData(next);
      setSelectedId((current) => current || next.organizations[0]?.id || "");
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load organizations.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(async (organizationId: string) => {
    if (!organizationId) return;
    try {
      setAnalytics(await api.get<Analytics>(`/organizations/${organizationId}/analytics`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load organization analytics.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selected?.id) void loadAnalytics(selected.id); }, [selected?.id, loadAnalytics]);

  async function createOrganization(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setBusy(true);
    try {
      await api.post("/organizations", { name: name.trim(), slug: slug.trim() });
      setName("");
      setSlug("");
      await load();
      setMessage("Organization created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create organization.");
    } finally { setBusy(false); }
  }

  async function linkShop(event: FormEvent) {
    event.preventDefault();
    if (!selected || !shopId.trim()) return;
    setBusy(true);
    try {
      await api.post(`/organizations/${selected.id}/shops`, {
        shopId: shopId.trim(),
        branchCode: branchCode.trim().toUpperCase() || undefined,
      });
      setShopId("");
      setBranchCode("");
      await load();
      setMessage("Venue linked to organization.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not link venue.");
    } finally { setBusy(false); }
  }

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!selected || !memberEmail.trim()) return;
    setBusy(true);
    try {
      await api.post(`/organizations/${selected.id}/members`, {
        email: memberEmail.trim(), role: memberRole, accessMode,
      });
      setMemberEmail("");
      setMessage("Organization member updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update organization member.");
    } finally { setBusy(false); }
  }

  const input = "w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50";
  const button = "rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50";

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">{message}</div> : null}

      <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Organization control</h2>
        <p className="mt-1 text-xs text-zinc-500">Organization access never replaces venue-level tenant isolation. Operational venue access is still explicit.</p>
        <form onSubmit={createOrganization} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Organization name" />
          <input className={input} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="organization-slug" />
          <button className={button} disabled={busy}>Create</button>
        </form>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Locations</h2>
            <p className="mt-1 text-xs text-zinc-500">Only venues you directly own can be linked.</p>
          </div>
          <select className={input + " max-w-sm"} value={selected?.id ?? ""} onChange={(e) => setSelectedId(e.target.value)} disabled={loading}>
            {data.organizations.length === 0 ? <option value="">No organizations</option> : null}
            {data.organizations.map((org) => <option key={org.id} value={org.id}>{org.name} — {org.role}</option>)}
          </select>
        </div>
        {selected ? (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {selected.shops.map((shop) => (
                <div key={shop.id} className="rounded-lg border border-white/10 bg-zinc-950/40 p-3">
                  <div className="font-medium text-zinc-100">{shop.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">{shop.currency ?? "—"} · {shop.timezone ?? "—"}</div>
                  <div className="mt-1 font-mono text-xs text-zinc-500">Branch: {shop.branchCode ?? "not set"}</div>
                  <div className="mt-2 text-xs text-zinc-400">Operational access: {shop.operationalAccess ? shop.operationalRole ?? "yes" : "no"}</div>
                  <div className="text-xs text-zinc-400">Shared catalog: {shop.sharedCatalogEnabled ? "enabled" : "disabled"}</div>
                </div>
              ))}
            </div>
            <form onSubmit={linkShop} className="mt-4 grid gap-2 md:grid-cols-[1fr_12rem_auto]">
              <input className={input + " max-w-md"} value={shopId} onChange={(e) => setShopId(e.target.value)} placeholder="Owned venue ID to link" />
              <input className={input} value={branchCode} onChange={(e) => setBranchCode(e.target.value)} placeholder="Branch code" />
              <button className={button} disabled={busy}>Link venue</button>
            </form>
          </>
        ) : null}
      </section>

      {selected ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <h2 className="text-sm font-semibold text-zinc-100">Group analytics</h2>
            <div className="mt-3 text-2xl font-semibold text-zinc-100">{analytics?.totals.netRevenue ?? "—"} {analytics?.comparableCurrency ?? ""}</div>
            <div className="mt-3 space-y-2">
              {analytics?.shops.map((shop) => (
                <div key={shop.id} className="flex justify-between rounded-md border border-white/10 px-3 py-2 text-sm">
                  <span className="text-zinc-300">{shop.name}</span><span className="text-zinc-100">{shop.netRevenue} {shop.currency}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <h2 className="text-sm font-semibold text-zinc-100">Organization member</h2>
            <form onSubmit={addMember} className="mt-3 space-y-3">
              <input className={input} type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="Existing GoSpots user email" />
              <div className="grid gap-3 sm:grid-cols-2">
                <select className={input} value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
                  {['ADMIN','ANALYST','OPERATOR','OWNER'].map((role) => <option key={role}>{role}</option>)}
                </select>
                <select className={input} value={accessMode} onChange={(e) => setAccessMode(e.target.value)}>
                  <option value="EXPLICIT">EXPLICIT</option><option value="ALL_SHOPS">ALL_SHOPS</option>
                </select>
              </div>
              <button className={button} disabled={busy}>Add / update member</button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}
