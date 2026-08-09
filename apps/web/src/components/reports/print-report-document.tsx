import type { ReactNode } from "react";

const REPORT_PRINT_CSS = `
.gs-print-report {
  display: none;
}

@media print {
  @page {
    size: A4 portrait;
    margin: 13mm 12mm 15mm;
  }

  html,
  body {
    background: #ffffff !important;
    color: #172033 !important;
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
  }

  body * {
    visibility: hidden !important;
  }

  .gs-print-report,
  .gs-print-report * {
    visibility: visible !important;
  }

  .gs-print-report {
    display: block !important;
    position: absolute !important;
    inset: 0 auto auto 0 !important;
    width: 100% !important;
    min-height: 100% !important;
    background: #ffffff !important;
    color: #172033 !important;
    font-family: Arial, Helvetica, sans-serif !important;
    font-size: 9.5pt !important;
    line-height: 1.42 !important;
  }

  .gs-report-header {
    position: relative;
    padding: 0 0 7mm;
    margin: 0 0 6mm;
    border-bottom: 1px solid #dfe5ec;
  }

  .gs-report-header::after {
    content: "";
    position: absolute;
    left: 0;
    bottom: -1px;
    width: 42mm;
    height: 2.5px;
    background: linear-gradient(90deg, #059669, #0ea5a6, #d97706);
  }

  .gs-report-brand {
    margin: 0 0 1.5mm;
    color: #047857;
    font-size: 8pt;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .gs-report-title {
    margin: 0;
    color: #0f172a;
    font-size: 21pt;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  .gs-report-subtitle {
    margin: 2mm 0 0;
    color: #526071;
    font-size: 10pt;
  }

  .gs-report-meta {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 3mm;
    margin-top: 4mm;
  }

  .gs-report-meta-item {
    padding: 2.5mm 3mm;
    border: 1px solid #e2e8f0;
    border-radius: 2.5mm;
    background: #f8fafc;
  }

  .gs-report-meta-label,
  .gs-report-kpi-label {
    display: block;
    margin-bottom: 0.7mm;
    color: #718096;
    font-size: 6.7pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .gs-report-meta-value {
    display: block;
    color: #1e293b;
    font-size: 8.5pt;
    font-weight: 650;
    overflow-wrap: anywhere;
  }

  .gs-report-kpis {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 3mm;
    margin: 0 0 6mm;
  }

  .gs-report-kpi {
    min-height: 19mm;
    padding: 3.5mm;
    border: 1px solid #dce5e4;
    border-radius: 3mm;
    background: linear-gradient(145deg, #f4fbf8 0%, #ffffff 72%);
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .gs-report-kpi-value {
    display: block;
    color: #0f172a;
    font-size: 14.5pt;
    font-weight: 800;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .gs-report-kpi-note {
    display: block;
    margin-top: 1mm;
    color: #64748b;
    font-size: 7.3pt;
    line-height: 1.25;
  }

  .gs-report-section {
    margin: 0 0 6mm;
  }

  .gs-report-section--keep {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .gs-report-section--new-page {
    break-before: page;
    page-break-before: always;
  }

  .gs-report-section-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 3mm;
    margin: 0 0 2.5mm;
    padding-bottom: 1.5mm;
    border-bottom: 1px solid #dfe5ec;
    color: #1e293b;
    font-size: 11pt;
    font-weight: 800;
  }

  .gs-report-section-note {
    color: #718096;
    font-size: 7.2pt;
    font-weight: 500;
  }

  .gs-report-table-wrap {
    width: 100%;
    overflow: visible;
    border: 1px solid #e2e8f0;
    border-radius: 2.5mm;
  }

  .gs-report-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 8pt;
  }

  .gs-report-table thead {
    display: table-header-group;
  }

  .gs-report-table th {
    padding: 2mm 2.2mm;
    border-bottom: 1px solid #cbd5e1;
    background: #eef4f5 !important;
    color: #334155;
    font-size: 6.8pt;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-align: left;
    text-transform: uppercase;
  }

  .gs-report-table td {
    padding: 1.9mm 2.2mm;
    border-bottom: 1px solid #edf1f5;
    color: #334155;
    vertical-align: top;
    overflow-wrap: anywhere;
  }

  .gs-report-table tbody tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .gs-report-table tbody tr:nth-child(even) td {
    background: #fafcfd !important;
  }

  .gs-report-table tbody tr:last-child td {
    border-bottom: 0;
  }

  .gs-report-table .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .gs-report-table .positive {
    color: #047857;
    font-weight: 700;
  }

  .gs-report-table .negative {
    color: #be123c;
    font-weight: 700;
  }

  .gs-report-table .muted {
    color: #718096;
  }

  .gs-report-empty {
    padding: 5mm;
    border: 1px dashed #cbd5e1;
    border-radius: 2.5mm;
    color: #718096;
    text-align: center;
  }

  .gs-report-footer {
    margin-top: 8mm;
    padding-top: 3mm;
    border-top: 1px solid #e2e8f0;
    color: #718096;
    font-size: 6.8pt;
    text-align: center;
  }
}
`;

export function PrintReportDocument({
  title,
  venueName,
  period,
  generatedAt,
  locale,
  currency,
  children,
}: {
  title: string;
  venueName: string;
  period: string;
  generatedAt: Date;
  locale: string;
  currency: string;
  children: ReactNode;
}) {
  const generatedLabel = generatedAt.toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const labels = locale.toLowerCase().startsWith("pl")
    ? { period: "Okres", currency: "Waluta", generated: "Wygenerowano" }
    : { period: "Period", currency: "Currency", generated: "Generated" };

  return (
    <div className="gs-print-report" aria-hidden="true">
      <style>{REPORT_PRINT_CSS}</style>
      <header className="gs-report-header">
        <p className="gs-report-brand">GoSpots</p>
        <h1 className="gs-report-title">{title}</h1>
        <p className="gs-report-subtitle">{venueName}</p>
        <div className="gs-report-meta">
          <div className="gs-report-meta-item">
            <span className="gs-report-meta-label">{labels.period}</span>
            <span className="gs-report-meta-value">{period}</span>
          </div>
          <div className="gs-report-meta-item">
            <span className="gs-report-meta-label">{labels.currency}</span>
            <span className="gs-report-meta-value">{currency}</span>
          </div>
          <div className="gs-report-meta-item">
            <span className="gs-report-meta-label">{labels.generated}</span>
            <span className="gs-report-meta-value">{generatedLabel}</span>
          </div>
        </div>
      </header>
      {children}
      <footer className="gs-report-footer">
        GoSpots · {venueName} · {generatedLabel}
      </footer>
    </div>
  );
}

export function ReportMetricGrid({
  items,
}: {
  items: { label: string; value: string; note?: string }[];
}) {
  return (
    <section className="gs-report-kpis">
      {items.map((item) => (
        <div className="gs-report-kpi" key={item.label}>
          <span className="gs-report-kpi-label">{item.label}</span>
          <span className="gs-report-kpi-value">{item.value}</span>
          {item.note ? (
            <span className="gs-report-kpi-note">{item.note}</span>
          ) : null}
        </div>
      ))}
    </section>
  );
}

export function ReportSection({
  title,
  note,
  keepTogether = false,
  newPage = false,
  children,
}: {
  title: string;
  note?: string;
  keepTogether?: boolean;
  newPage?: boolean;
  children: ReactNode;
}) {
  const classes = [
    "gs-report-section",
    keepTogether ? "gs-report-section--keep" : "",
    newPage ? "gs-report-section--new-page" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes}>
      <h2 className="gs-report-section-title">
        <span>{title}</span>
        {note ? <span className="gs-report-section-note">{note}</span> : null}
      </h2>
      {children}
    </section>
  );
}
