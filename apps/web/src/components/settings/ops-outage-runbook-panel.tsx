"use client";

import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

/** Owner-facing partial-outage runbook (Bible #32). Static — no API. */
const ROW_KEYS = [
  "ready503",
  "proxy503",
  "web502",
  "emailMissing",
  "webhookFail",
  "sessionExpired",
  "duplicateMail",
] as const;

export function OpsOutageRunbookPanel() {
  const vs = useVenueSettingsOptional();
  const t = vs?.t ?? ((key: string) => key);
  const [open, setOpen] = useState(false);

  return (
    <section className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sky-300">
            <Activity size={18} />
            <h2 className="font-semibold text-white">{t("opsOutage.title")}</h2>
          </div>
          <p className="mt-2 text-sm text-zinc-500">{t("opsOutage.hint")}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
        >
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {open ? t("opsOutage.hide") : t("opsOutage.show")}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-4">
          <p className="text-xs leading-relaxed text-zinc-400">
            {t("opsOutage.modesIntro")}
          </p>
          <ul className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
            <li>
              <span className="font-medium text-zinc-200">
                {t("opsOutage.modeA")}
              </span>
              {" — "}
              {t("opsOutage.modeADesc")}
            </li>
            <li>
              <span className="font-medium text-zinc-200">
                {t("opsOutage.modeB")}
              </span>
              {" — "}
              {t("opsOutage.modeBDesc")}
            </li>
            <li>
              <span className="font-medium text-zinc-200">
                {t("opsOutage.modeC")}
              </span>
              {" — "}
              {t("opsOutage.modeCDesc")}
            </li>
            <li>
              <span className="font-medium text-zinc-200">
                {t("opsOutage.modeF")}
              </span>
              {" — "}
              {t("opsOutage.modeFDesc")}
            </li>
          </ul>

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[36rem] text-left text-xs">
              <thead className="bg-zinc-950/80 text-[10px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">
                    {t("opsOutage.colSymptom")}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t("opsOutage.colCause")}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t("opsOutage.colAction")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {ROW_KEYS.map((key) => (
                  <tr key={key} className="align-top text-zinc-300">
                    <td className="px-3 py-2.5">
                      {t(`opsOutage.row.${key}.symptom`)}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400">
                      {t(`opsOutage.row.${key}.cause`)}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400">
                      {t(`opsOutage.row.${key}.action`)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] leading-relaxed text-zinc-500">
            {t("opsOutage.footer")}
          </p>
        </div>
      ) : null}
    </section>
  );
}
