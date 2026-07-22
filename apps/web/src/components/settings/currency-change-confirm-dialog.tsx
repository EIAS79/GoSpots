"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { ModalPortal } from "@/components/ui/modal-portal";
import { formatMoney } from "@/lib/format";
import type { CurrencyChangePreview } from "@/lib/shop-settings-client";

const SAMPLE = 5;

type Props = {
  open: boolean;
  preview: CurrencyChangePreview | null;
  locale: string;
  busy?: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onConfirm: () => void;
  onCancel: () => void;
};

function PriceRow({
  label,
  before,
  after,
  from,
  to,
  locale,
}: {
  label: string;
  before: number;
  after: number;
  from: string;
  to: string;
  locale: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1.5 text-xs last:border-0">
      <span className="min-w-0 truncate text-zinc-300">{label}</span>
      <span className="shrink-0 tabular-nums text-zinc-500">
        {formatMoney(before, from, locale)}
        <span className="mx-1.5 text-zinc-600">→</span>
        <span className="text-zinc-200">{formatMoney(after, to, locale)}</span>
      </span>
    </li>
  );
}

function Section({
  title,
  count,
  children,
  moreLabel,
}: {
  title: string;
  count: number;
  children: ReactNode;
  moreLabel?: string | null;
}) {
  if (count <= 0) return null;
  return (
    <div className="mt-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {title}{" "}
        <span className="font-normal normal-case tracking-normal text-zinc-600">
          ({count})
        </span>
      </p>
      <ul className="mt-1">{children}</ul>
      {moreLabel ? (
        <p className="mt-1 text-[11px] text-zinc-600">{moreLabel}</p>
      ) : null}
    </div>
  );
}

export function CurrencyChangeConfirmDialog({
  open,
  preview,
  locale,
  busy = false,
  t,
  onConfirm,
  onCancel,
}: Props) {
  if (!open || !preview) return null;

  const { from, to, rate, ratesAt, summary } = preview;
  const menuSample = preview.menuItems.slice(0, SAMPLE);
  const rateSample = preview.resourceRates.slice(0, SAMPLE);
  const resourceSample = preview.resources.slice(0, SAMPLE);
  const offeringSample = preview.offerings.slice(0, SAMPLE);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={() => !busy && onCancel()}
      >
        <div
          role="alertdialog"
          aria-labelledby="currency-confirm-title"
          aria-describedby="currency-confirm-desc"
          className="max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/50"
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            id="currency-confirm-title"
            className="text-lg font-semibold text-white"
          >
            {t("settings.currencyConfirmTitle")}
          </h2>
          <p
            id="currency-confirm-desc"
            className="mt-2 text-sm leading-relaxed text-zinc-400"
          >
            {t("settings.currencyConfirmRate", {
              from,
              to,
              rate: rate.toFixed(4),
              when: new Date(ratesAt).toLocaleString(locale),
            })}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            {t("settings.currencyConfirmSummary", {
              menu: summary.menuItems,
              rates: summary.resourceRates,
              resources: summary.resources,
              offerings: summary.offerings,
            })}
          </p>
          <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/90">
            {t("settings.currencyConfirmHistorical")}
          </p>

          <Section
            title={t("settings.currencyConfirmMenu")}
            count={summary.menuItems}
            moreLabel={
              summary.menuItems > SAMPLE
                ? t("settings.currencyConfirmMore", {
                    n: summary.menuItems - SAMPLE,
                  })
                : null
            }
          >
            {menuSample.map((row) => (
              <PriceRow
                key={row.id}
                label={row.name}
                before={row.priceBefore}
                after={row.priceAfter}
                from={from}
                to={to}
                locale={locale}
              />
            ))}
          </Section>

          <Section
            title={t("settings.currencyConfirmRates")}
            count={summary.resourceRates}
            moreLabel={
              summary.resourceRates > SAMPLE
                ? t("settings.currencyConfirmMore", {
                    n: summary.resourceRates - SAMPLE,
                  })
                : null
            }
          >
            {rateSample.map((row) => (
              <PriceRow
                key={row.id}
                label={row.label}
                before={row.priceBefore}
                after={row.priceAfter}
                from={from}
                to={to}
                locale={locale}
              />
            ))}
          </Section>

          <Section
            title={t("settings.currencyConfirmResources")}
            count={summary.resources}
            moreLabel={
              summary.resources > SAMPLE
                ? t("settings.currencyConfirmMore", {
                    n: summary.resources - SAMPLE,
                  })
                : null
            }
          >
            {resourceSample.map((row) => (
              <PriceRow
                key={row.id}
                label={row.name}
                before={row.hourlyRateBefore}
                after={row.hourlyRateAfter}
                from={from}
                to={to}
                locale={locale}
              />
            ))}
          </Section>

          <Section
            title={t("settings.currencyConfirmOfferings")}
            count={summary.offerings}
            moreLabel={
              summary.offerings > SAMPLE
                ? t("settings.currencyConfirmMore", {
                    n: summary.offerings - SAMPLE,
                  })
                : null
            }
          >
            {offeringSample.map((row) => (
              <li
                key={row.id}
                className="border-b border-white/5 py-1.5 text-xs text-zinc-300 last:border-0"
              >
                {row.name}
                <span className="ml-2 text-zinc-600">
                  {t("settings.currencyConfirmOfferingUpdated")}
                </span>
              </li>
            ))}
          </Section>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="inline-flex min-w-[5.5rem] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {t("settings.currencyConfirmApply")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
