"use client";

import { cn } from "@/lib/cn";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

export type InvoiceLineItem = {
  id: string;
  description: string;
  detail?: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type InvoiceDocumentData = {
  invoiceNumber: string;
  issuedAt: Date;
  title?: string;
  venue: {
    name: string;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  customerName?: string | null;
  note?: string | null;
  paymentMethod?: string | null;
  lines: InvoiceLineItem[];
  currencyLabel: (amount: number) => string;
};

export function InvoiceDocument({
  data,
  className,
}: {
  data: InvoiceDocumentData;
  className?: string;
}) {
  const settings = useVenueSettingsOptional();
  const t = settings?.t ?? ((k: string) => k);
  const locale = settings?.locale ?? "en";

  const subtotal = data.lines.reduce((s, l) => s + l.total, 0);
  const locality = [data.venue.city, data.venue.country]
    .filter(Boolean)
    .join(", ");

  return (
    <article
      className={cn(
        "invoice-sheet relative overflow-hidden rounded-2xl bg-[#f7f4ef] text-zinc-900 shadow-2xl shadow-black/40",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-700 via-teal-600 to-amber-500"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-10 h-48 w-48 rounded-full bg-emerald-600/10 blur-2xl"
      />

      <header className="relative border-b border-zinc-900/10 px-4 pb-6 pt-6 sm:px-8 sm:pt-8 md:px-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-800/80">
              {data.title ?? t("finance.invDocTitleFallback")}
            </p>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              {data.venue.name}
            </h1>
            <div className="mt-3 space-y-0.5 text-sm text-zinc-600">
              {data.venue.address ? <p>{data.venue.address}</p> : null}
              {locality ? <p>{locality}</p> : null}
              {data.venue.phone ? <p>{data.venue.phone}</p> : null}
              {data.venue.email ? <p>{data.venue.email}</p> : null}
            </div>
          </div>

          <div className="min-w-[11rem] rounded-xl border border-zinc-900/10 bg-white/70 px-4 py-3 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("finance.invDocNumber")}
            </p>
            <p className="mt-1 font-mono text-base font-semibold text-zinc-900">
              {data.invoiceNumber}
            </p>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("finance.invDocIssued")}
            </p>
            <p className="mt-1 text-zinc-800">
              {data.issuedAt.toLocaleString(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
        </div>

        {(data.customerName || data.paymentMethod) && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {data.customerName ? (
              <div className="rounded-lg bg-zinc-900/[0.04] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {t("finance.invDocBillTo")}
                </p>
                <p className="mt-1 text-sm font-medium text-zinc-900">
                  {data.customerName}
                </p>
              </div>
            ) : null}
            {data.paymentMethod ? (
              <div className="rounded-lg bg-zinc-900/[0.04] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {t("finance.invDocPayment")}
                </p>
                <p className="mt-1 text-sm font-medium capitalize text-zinc-900">
                  {data.paymentMethod.toLowerCase()}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </header>

      <div className="relative px-4 py-6 sm:px-8 md:px-10">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-900/15 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              <th className="pb-3 font-semibold">{t("finance.invDocDescription")}</th>
              <th className="pb-3 text-right font-semibold">{t("finance.invDocQty")}</th>
              <th className="hidden pb-3 text-right font-semibold sm:table-cell">
                {t("finance.invDocUnit")}
              </th>
              <th className="pb-3 text-right font-semibold">{t("finance.invDocTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr
                key={line.id}
                className="border-b border-zinc-900/[0.07] align-top"
              >
                <td className="py-3.5 pr-4">
                  <p className="font-medium text-zinc-900">{line.description}</p>
                  {line.detail ? (
                    <p className="mt-0.5 text-xs text-zinc-500">{line.detail}</p>
                  ) : null}
                </td>
                <td className="py-3.5 text-right tabular-nums text-zinc-700">
                  {line.quantity}
                </td>
                <td className="hidden py-3.5 text-right tabular-nums text-zinc-700 sm:table-cell">
                  {data.currencyLabel(line.unitPrice)}
                </td>
                <td className="py-3.5 text-right font-medium tabular-nums text-zinc-900">
                  {data.currencyLabel(line.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {data.note ? (
          <p className="mt-5 rounded-lg border border-dashed border-zinc-900/15 bg-white/50 px-3 py-2 text-xs text-zinc-600">
            <span className="font-semibold text-zinc-800">
              {t("finance.invDocNote")}{" "}
            </span>
            {data.note}
          </p>
        ) : null}

        <div className="mt-8 flex justify-end">
          <div className="w-full max-w-xs overflow-hidden rounded-xl border border-zinc-900/10 bg-gradient-to-br from-zinc-900 to-emerald-950 text-white shadow-lg">
            <div className="flex items-center justify-between px-4 py-3 text-xs uppercase tracking-wider text-emerald-200/80">
              <span>{t("finance.invDocSubtotal")}</span>
              <span className="tabular-nums text-sm font-medium text-white">
                {data.currencyLabel(subtotal)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 bg-emerald-500/20 px-4 py-4">
              <span className="text-sm font-semibold tracking-wide">
                {t("finance.invDocTotalDue")}
              </span>
              <span className="font-serif text-2xl font-semibold tabular-nums">
                {data.currencyLabel(subtotal)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <footer className="relative border-t border-zinc-900/10 px-4 py-5 text-center text-[11px] text-zinc-500 sm:px-8 md:px-10">
        {t("finance.invDocFooter")}
      </footer>
    </article>
  );
}
