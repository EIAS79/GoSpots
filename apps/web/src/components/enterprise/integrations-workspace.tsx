"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

type Provider = { provider: string; capabilities: Record<string, unknown> };
type Installation = {
  id: string; provider: string; name: string; status: string; hasSecrets: boolean;
  lastHealthAt: string | null; lastErrorMessage: string | null;
};
type Job = {
  id: string; installationId: string; jobType: string; direction: string; status: string;
  attemptCount: number; maxAttempts: number; lastError: string | null; createdAt: string;
};

export function IntegrationsWorkspace() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [provider, setProvider] = useState("demo");
  const [name, setName] = useState("");
  const [config, setConfig] = useState("{}");
  const [secrets, setSecrets] = useState("{}");
  const [credentialName, setCredentialName] = useState("");
  const [scopes, setScopes] = useState("venue.read,resources.read,integrations.jobs.write");
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);
  const [webhookName, setWebhookName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState("*");
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [providerData, installationData, jobData] = await Promise.all([
        api.get<{ providers: Provider[] }>("/integrations/providers"),
        api.get<{ installations: Installation[] }>("/integrations/installations"),
        api.get<{ jobs: Job[] }>("/integrations/jobs?take=50"),
      ]);
      setProviders(providerData.providers);
      setInstallations(installationData.installations);
      setJobs(jobData.jobs);
      if (!providerData.providers.some((item) => item.provider === provider)) {
        setProvider(providerData.providers[0]?.provider ?? "demo");
      }
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load integrations.");
    }
  }, [provider]);

  useEffect(() => { void load(); }, [load]);

  function parseObject(value: string, label: string) {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(`${label} must be a JSON object.`);
    return parsed as Record<string, unknown>;
  }

  async function install(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const parsedSecrets = parseObject(secrets, "Secrets");
      await api.post("/integrations/installations", {
        provider, name: name.trim(), config: parseObject(config, "Config"),
        ...(Object.keys(parsedSecrets).length ? { secrets: parsedSecrets } : {}),
      });
      setName(""); setConfig("{}"); setSecrets("{}"); await load();
      setMessage("Connector installed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not install connector."); }
    finally { setBusy(false); }
  }

  async function health(id: string) {
    setBusy(true);
    try {
      const result = await api.post<{ ok: boolean; detail?: string }>(`/integrations/installations/${id}/health`);
      await load();
      setMessage(result.ok ? "Connector health check passed." : result.detail ?? "Connector health check failed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Health check failed."); }
    finally { setBusy(false); }
  }

  async function createCredential(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api.post<{ token: string }>("/integrations/credentials", {
        name: credentialName.trim(), scopes: scopes.split(",").map((v) => v.trim()).filter(Boolean),
      });
      setOneTimeToken(result.token); setCredentialName("");
      setMessage("API credential created. Copy the token now; it cannot be shown again.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create API credential."); }
    finally { setBusy(false); }
  }

  async function createWebhook(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api.post<{ signingSecret: string }>("/integrations/webhooks", {
        name: webhookName.trim(), url: webhookUrl.trim(),
        eventTypes: webhookEvents.split(",").map((v) => v.trim()).filter(Boolean),
      });
      setWebhookSecret(result.signingSecret); setWebhookName(""); setWebhookUrl("");
      setMessage("Webhook endpoint created. Copy the signing secret now.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create webhook."); }
    finally { setBusy(false); }
  }

  async function retryJob(id: string) {
    setBusy(true);
    try { await api.post(`/integrations/jobs/${id}/retry`); await load(); setMessage("Integration job requeued."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not retry job."); }
    finally { setBusy(false); }
  }

  const input = "w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50";
  const button = "rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50";

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">{message}</div> : null}
      <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Connector installations</h2>
        <p className="mt-1 text-xs text-zinc-500">Only provider adapters explicitly installed and supported by GoSpots appear here. Core venue operation does not depend on an integration.</p>
        <form onSubmit={install} className="mt-4 grid gap-3 lg:grid-cols-2">
          <select className={input} value={provider} onChange={(e) => setProvider(e.target.value)}>{providers.map((item) => <option key={item.provider}>{item.provider}</option>)}</select>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Installation name" required />
          <textarea className={input + " min-h-24 font-mono text-xs"} value={config} onChange={(e) => setConfig(e.target.value)} aria-label="Connector configuration JSON" />
          <textarea className={input + " min-h-24 font-mono text-xs"} value={secrets} onChange={(e) => setSecrets(e.target.value)} aria-label="Connector secrets JSON" />
          <button className={button + " lg:col-span-2 lg:w-fit"} disabled={busy}>Install connector</button>
        </form>
        <div className="mt-4 space-y-2">
          {installations.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-zinc-950/40 p-3">
              <div><div className="text-sm font-medium text-zinc-100">{item.name} · {item.provider}</div><div className="mt-1 text-xs text-zinc-500">{item.status}{item.lastErrorMessage ? ` · ${item.lastErrorMessage}` : ""}</div></div>
              <button className="rounded-md border border-white/10 px-3 py-2 text-xs text-zinc-200" onClick={() => void health(item.id)} disabled={busy}>Health check</button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={createCredential} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <h2 className="text-sm font-semibold text-zinc-100">Scoped API credential</h2>
          <div className="mt-3 space-y-3"><input className={input} value={credentialName} onChange={(e) => setCredentialName(e.target.value)} placeholder="Credential name" required /><input className={input} value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder="Comma-separated scopes" /><button className={button} disabled={busy}>Create credential</button></div>
          {oneTimeToken ? <pre className="mt-3 overflow-auto rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">{oneTimeToken}</pre> : null}
        </form>
        <form onSubmit={createWebhook} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <h2 className="text-sm font-semibold text-zinc-100">Signed outbound webhook</h2>
          <div className="mt-3 space-y-3"><input className={input} value={webhookName} onChange={(e) => setWebhookName(e.target.value)} placeholder="Endpoint name" required /><input className={input} type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://example.com/webhook" required /><input className={input} value={webhookEvents} onChange={(e) => setWebhookEvents(e.target.value)} placeholder="event.one,event.two or *" /><button className={button} disabled={busy}>Create webhook</button></div>
          {webhookSecret ? <pre className="mt-3 overflow-auto rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">{webhookSecret}</pre> : null}
        </form>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Integration queue</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="text-zinc-500"><tr><th className="p-2">Job</th><th className="p-2">Direction</th><th className="p-2">Status</th><th className="p-2">Attempts</th><th className="p-2">Error</th><th className="p-2"></th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id} className="border-t border-white/10"><td className="p-2 text-zinc-200">{job.jobType}</td><td className="p-2 text-zinc-400">{job.direction}</td><td className="p-2 text-zinc-300">{job.status}</td><td className="p-2 text-zinc-400">{job.attemptCount}/{job.maxAttempts}</td><td className="max-w-sm truncate p-2 text-zinc-500">{job.lastError ?? "—"}</td><td className="p-2">{job.status === "DEAD" || job.status === "RETRY" ? <button className="rounded border border-white/10 px-2 py-1 text-zinc-200" onClick={() => void retryJob(job.id)} disabled={busy}>Retry</button> : null}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}
