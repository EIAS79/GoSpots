"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

const REPORT_PRINT_CSS = `
.gs-print-report {
  display: none !important;
}

@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }

  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
    width: 210mm !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    background: #ffffff !important;
    color: #172033 !important;
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
  }

  body > *:not(.gs-print-report) {
    display: none !important;
  }

  .gs-print-report {
    display: block !important;
    position: static !important;
    width: 210mm !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 9mm 10mm 11mm !important;
    overflow: visible !important;
    box-sizing: border-box !important;
    background: #ffffff !important;
    color: #172033 !important;
    font-family: Arial, Helvetica, sans-serif !important;
    font-size: 9pt !important;
    line-height: 1.36 !important;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }

  .gs-report-header {
    position: relative;
    padding: 0 0 4.5mm;
    margin: 0 0 4.5mm;
    border-bottom: 1px solid #dfe5ec;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .gs-report-header::after {
    content: "";
    position: absolute;
    left: 0;
    bottom: -1px;
    width: 44mm;
    height: 2.5px;
    background: linear-gradient(90deg, #059669, #0ea5a6, #d97706);
  }

  .gs-report-brand {
    margin: 0 0 1.1mm;
    color: #047857;
    font-size: 7.6pt;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .gs-report-title {
    margin: 0;
    color: #0f172a;
    font-size: 18.5pt;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  .gs-report-subtitle {
    margin: 1.4mm 0 0;
    color: #526071;
    font-size: 9.2pt;
  }

  .gs-report-meta {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2.4mm;
    margin-top: 3.3mm;
  }

  .gs-report-meta-item {
    padding: 2mm 2.5mm;
    border: 1px solid #e2e8f0;
    border-radius: 2mm;
    background: #f8fafc !important;
  }

  .gs-report-meta-label,
  .gs-report-kpi-label {
    display: block;
    margin-bottom: 0.55mm;
    color: #718096;
    font-size: 6.3pt;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .gs-report-meta-value {
    display: block;
    color: #1e293b;
    font-size: 8.1pt;
    font-weight: 650;
    overflow-wrap: anywhere;
  }

  .gs-report-kpis {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2.4mm;
    margin: 0 0 4.8mm;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .gs-report-kpi {
    min-height: 15mm;
    padding: 2.8mm;
    border: 1px solid #dce5e4;
    border-radius: 2.4mm;
    background: linear-gradient(145deg, #f4fbf8 0%, #ffffff 72%) !important;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .gs-report-kpi-value {
    display: block;
    color: #0f172a;
    font-size: 12.5pt;
    font-weight: 800;
    line-height: 1.17;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .gs-report-kpi-note {
    display: block;
    margin-top: 0.75mm;
    color: #64748b;
    font-size: 6.8pt;
    line-height: 1.2;
  }

  .gs-report-section {
    margin: 0 0 5mm;
    break-inside: auto;
    page-break-inside: auto;
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
    margin: 0 0 2mm;
    padding: 0 0 1.3mm;
    border-bottom: 1px solid #dfe5ec;
    color: #1e293b;
    font-size: 10.2pt;
    font-weight: 800;
    break-after: avoid;
    page-break-after: avoid;
  }

  .gs-report-section-note {
    color: #718096;
    font-size: 6.8pt;
    font-weight: 500;
  }

  .gs-report-auto-chart {
    margin: 0 0 2.8mm;
    padding: 2.2mm 2.3mm 1.3mm;
    border: 1px solid #e2e8f0;
    border-radius: 2.2mm;
    background: #ffffff !important;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .gs-report-auto-chart svg {
    display: block;
    width: 100%;
    height: auto;
    max-height: 54mm;
  }

  .gs-report-chart-caption {
    margin: 1mm 0 0;
    color: #718096;
    font-size: 6.2pt;
    text-align: right;
  }

  .gs-report-table-wrap {
    width: 100%;
    overflow: visible !important;
    border: 0;
    border-radius: 0;
    break-inside: auto;
    page-break-inside: auto;
  }

  .gs-report-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    border: 1px solid #e2e8f0;
    font-size: 7.5pt;
  }

  .gs-report-table thead {
    display: table-header-group !important;
  }

  .gs-report-table tfoot {
    display: table-footer-group !important;
  }

  .gs-report-table th {
    padding: 1.65mm 1.8mm;
    border-bottom: 1px solid #cbd5e1;
    background: #eef4f5 !important;
    color: #334155;
    font-size: 6.3pt;
    font-weight: 800;
    letter-spacing: 0.03em;
    text-align: left;
    text-transform: uppercase;
  }

  .gs-report-table td {
    padding: 1.5mm 1.8mm;
    border-bottom: 1px solid #edf1f5;
    color: #334155;
    vertical-align: top;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .gs-report-table tbody,
  .gs-report-table tr {
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
    padding: 4mm;
    border: 1px dashed #cbd5e1;
    border-radius: 2mm;
    color: #718096;
    text-align: center;
    break-inside: avoid;
  }

  .gs-report-footer {
    margin-top: 5mm;
    padding-top: 2.3mm;
    border-top: 1px solid #e2e8f0;
    color: #718096;
    font-size: 6.2pt;
    text-align: center;
    break-inside: avoid;
  }
}
`;

const SVG_NS = "http://www.w3.org/2000/svg";
const CHART_COLORS = ["#059669", "#0284c7", "#d97706", "#7c3aed", "#e11d48"];

type ParsedReportTable = {
  headers: string[];
  labels: string[];
  numericColumns: { index: number; header: string; values: number[] }[];
};

function textOf(node: Element | null): string {
  return node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function parseNumericCell(text: string): number | null {
  const source = text.replace(/\u00a0/g, " ").trim();
  if (!source || !/[0-9]/.test(source)) return null;
  const negative = /^\s*\(/.test(source) || /^\s*-/.test(source);
  let cleaned = source.replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = Math.max(comma, dot);
    const integer = cleaned.slice(0, decimal).replace(/[.,]/g, "");
    const fraction = cleaned.slice(decimal + 1).replace(/[.,]/g, "");
    cleaned = `${integer}.${fraction}`;
  } else if (comma >= 0) {
    const fractionLength = cleaned.length - comma - 1;
    cleaned =
      fractionLength > 0 && fractionLength <= 2
        ? `${cleaned.slice(0, comma).replace(/,/g, "")}.${cleaned.slice(comma + 1)}`
        : cleaned.replace(/,/g, "");
  } else if (dot >= 0) {
    const fractionLength = cleaned.length - dot - 1;
    if (fractionLength > 2) cleaned = cleaned.replace(/\./g, "");
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

function parseReportTable(table: HTMLTableElement): ParsedReportTable | null {
  const headers = Array.from(table.querySelectorAll("thead th")).map((cell) =>
    textOf(cell),
  );
  const rows = Array.from(table.querySelectorAll("tbody tr"));
  if (headers.length < 2 || rows.length < 2) return null;
  const cells = rows.map((row) => Array.from(row.querySelectorAll("td")));
  const labels = cells.map((row) => textOf(row[0] ?? null));
  const numericColumns: ParsedReportTable["numericColumns"] = [];
  for (let index = 1; index < headers.length; index += 1) {
    const parsed = cells.map((row) =>
      parseNumericCell(textOf(row[index] ?? null)),
    );
    const valid = parsed.filter((value): value is number => value != null);
    if (valid.length / rows.length < 0.7) continue;
    numericColumns.push({
      index,
      header: headers[index] ?? "",
      values: parsed.map((value) => value ?? 0),
    });
  }
  if (numericColumns.length === 0) return null;
  return { headers, labels, numericColumns };
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function appendText(
  svg: SVGSVGElement,
  x: number,
  y: number,
  text: string,
  attrs: Record<string, string | number> = {},
) {
  const node = svgEl("text", { x, y, ...attrs });
  node.textContent = text;
  svg.appendChild(node);
}

function compactNumber(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  if (absolute >= 100) return Math.round(value).toString();
  if (absolute >= 10) return value.toFixed(1).replace(/\.0$/, "");
  return value
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

function baseSvg(height = 220): SVGSVGElement {
  const svg = svgEl("svg", {
    viewBox: `0 0 760 ${height}`,
    role: "img",
    "aria-hidden": "true",
  });
  svg.style.fontFamily = "Arial, Helvetica, sans-serif";
  return svg;
}

function drawGrid(
  svg: SVGSVGElement,
  max: number,
  left = 54,
  right = 16,
  top = 15,
  bottom = 38,
) {
  const width = 760 - left - right;
  const height = 220 - top - bottom;
  for (let step = 0; step <= 4; step += 1) {
    const y = top + (height * step) / 4;
    svg.appendChild(
      svgEl("line", {
        x1: left,
        x2: left + width,
        y1: y,
        y2: y,
        stroke: "#e2e8f0",
        "stroke-width": 1,
      }),
    );
    appendText(svg, left - 8, y + 3, compactNumber(max * (1 - step / 4)), {
      fill: "#64748b",
      "font-size": 10,
      "text-anchor": "end",
    });
  }
  return { left, top, width, height };
}

function lineChart(
  parsed: ParsedReportTable,
  column = parsed.numericColumns[0],
) {
  const svg = baseSvg();
  const values = column.values;
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  const area = drawGrid(svg, max);
  const points = values.map((value, index) => {
    const x =
      area.left +
      (values.length <= 1
        ? area.width / 2
        : (area.width * index) / (values.length - 1));
    const y =
      area.top + area.height - (Math.max(0, value) / max) * area.height;
    return { x, y };
  });
  svg.appendChild(
    svgEl("polyline", {
      points: points.map(({ x, y }) => `${x},${y}`).join(" "),
      fill: "none",
      stroke: CHART_COLORS[0],
      "stroke-width": 3,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
  for (const point of points) {
    svg.appendChild(
      svgEl("circle", {
        cx: point.x,
        cy: point.y,
        r: 3.2,
        fill: "#ffffff",
        stroke: CHART_COLORS[0],
        "stroke-width": 2,
      }),
    );
  }
  const stride = Math.max(1, Math.ceil(parsed.labels.length / 7));
  parsed.labels.forEach((label, index) => {
    if (index % stride !== 0 && index !== parsed.labels.length - 1) return;
    appendText(svg, points[index]?.x ?? area.left, 207, label.slice(0, 15), {
      fill: "#64748b",
      "font-size": 9,
      "text-anchor": "middle",
    });
  });
  appendText(svg, area.left, 11, column.header, {
    fill: "#334155",
    "font-size": 10,
    "font-weight": 700,
  });
  return svg;
}

function groupedBarChart(parsed: ParsedReportTable) {
  const svg = baseSvg();
  const columns = parsed.numericColumns.slice(0, 4);
  const max = Math.max(
    1,
    ...columns.flatMap((column) =>
      column.values.map((value) => Math.abs(value)),
    ),
  );
  const area = drawGrid(svg, max, 54, 16, 28, 42);
  const groups = parsed.labels.length;
  const groupWidth = area.width / Math.max(groups, 1);
  const usable = groupWidth * 0.74;
  const barWidth = Math.max(1.5, usable / Math.max(columns.length, 1));
  columns.forEach((column, seriesIndex) => {
    column.values.forEach((value, index) => {
      const height = (Math.max(0, value) / max) * area.height;
      const x =
        area.left +
        groupWidth * index +
        (groupWidth - usable) / 2 +
        barWidth * seriesIndex;
      svg.appendChild(
        svgEl("rect", {
          x,
          y: area.top + area.height - height,
          width: Math.max(1, barWidth - 1),
          height,
          rx: 1.5,
          fill: CHART_COLORS[seriesIndex % CHART_COLORS.length],
        }),
      );
    });
  });
  const stride = Math.max(1, Math.ceil(parsed.labels.length / 7));
  parsed.labels.forEach((label, index) => {
    if (index % stride !== 0 && index !== parsed.labels.length - 1) return;
    appendText(
      svg,
      area.left + groupWidth * index + groupWidth / 2,
      207,
      label.slice(0, 13),
      {
        fill: "#64748b",
        "font-size": 8.5,
        "text-anchor": "middle",
      },
    );
  });
  let legendX = area.left;
  columns.forEach((column, index) => {
    svg.appendChild(
      svgEl("rect", {
        x: legendX,
        y: 8,
        width: 9,
        height: 9,
        rx: 1,
        fill: CHART_COLORS[index],
      }),
    );
    appendText(svg, legendX + 13, 16, column.header.slice(0, 18), {
      fill: "#475569",
      "font-size": 9,
    });
    legendX += Math.min(165, 35 + column.header.length * 6);
  });
  return svg;
}

function horizontalBarChart(
  parsed: ParsedReportTable,
  column = parsed.numericColumns[parsed.numericColumns.length - 1],
) {
  const rowCount = Math.min(parsed.labels.length, 10);
  const values = column.values.slice(0, rowCount);
  const labels = parsed.labels.slice(0, rowCount);
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  const height = Math.max(150, 42 + rowCount * 22);
  const svg = baseSvg(height);
  appendText(svg, 175, 16, column.header, {
    fill: "#334155",
    "font-size": 10,
    "font-weight": 700,
  });
  labels.forEach((label, index) => {
    const y = 31 + index * 22;
    appendText(svg, 165, y + 10, label.slice(0, 27), {
      fill: "#475569",
      "font-size": 9.5,
      "text-anchor": "end",
    });
    svg.appendChild(
      svgEl("rect", {
        x: 175,
        y,
        width: 520,
        height: 13,
        rx: 2,
        fill: "#edf2f7",
      }),
    );
    svg.appendChild(
      svgEl("rect", {
        x: 175,
        y,
        width: (Math.abs(values[index] ?? 0) / max) * 520,
        height: 13,
        rx: 2,
        fill:
          (values[index] ?? 0) < 0
            ? "#e11d48"
            : CHART_COLORS[index % CHART_COLORS.length],
      }),
    );
    appendText(svg, 705, y + 10, compactNumber(values[index] ?? 0), {
      fill: "#334155",
      "font-size": 9,
      "text-anchor": "start",
    });
  });
  return svg;
}

function looksTemporal(parsed: ParsedReportTable) {
  const firstHeader = (parsed.headers[0] ?? "").toLowerCase();
  if (/date|day|time|data|dzień|dzien|czas/.test(firstHeader)) return true;
  const matched = parsed.labels.filter((label) =>
    /\d{4}-\d{2}-\d{2}|\b(mon|tue|wed|thu|fri|sat|sun)\b|\b(pon|wt|śr|sr|czw|pt|sob|nd)\b/i.test(
      label,
    ),
  ).length;
  return matched >= Math.ceil(parsed.labels.length / 2);
}

function createAutoChart(parsed: ParsedReportTable): SVGElement | null {
  const lowerHeaders = parsed.headers.map((header) => header.toLowerCase());
  const temporal = looksTemporal(parsed);
  const hasQuantity = lowerHeaders.some((header) =>
    /quantity|qty|ilość|ilosc/.test(header),
  );
  const hasTotal = lowerHeaders.some((header) =>
    /total|razem|łącznie|lacznie/.test(header),
  );

  if (parsed.numericColumns.length === 1) {
    return temporal && parsed.labels.length >= 5
      ? lineChart(parsed)
      : horizontalBarChart(parsed);
  }

  if (hasQuantity || (!temporal && parsed.labels.length <= 12)) {
    return horizontalBarChart(parsed);
  }

  if (temporal && parsed.numericColumns.length <= 3) {
    return groupedBarChart(parsed);
  }

  if (temporal && parsed.numericColumns.length >= 4) {
    const totalColumn = hasTotal
      ? [...parsed.numericColumns]
          .reverse()
          .find((column) =>
            /total|razem|łącznie|lacznie/.test(column.header.toLowerCase()),
          )
      : undefined;
    if (totalColumn) return lineChart(parsed, totalColumn);

    const guestColumns = parsed.numericColumns.filter(
      (column) =>
        !/marketing|views|wyświet|wyswiet/.test(column.header.toLowerCase()),
    );
    const source = guestColumns.length > 0 ? guestColumns : parsed.numericColumns;
    const synthetic: ParsedReportTable["numericColumns"][number] = {
      index: -1,
      header: "Total",
      values: parsed.labels.map((_, rowIndex) =>
        source.reduce(
          (sum, column) => sum + (column.values[rowIndex] ?? 0),
          0,
        ),
      ),
    };
    return lineChart(parsed, synthetic);
  }

  return groupedBarChart(parsed);
}

function enhanceReportWithCharts(root: HTMLElement) {
  root
    .querySelectorAll(".gs-report-auto-chart")
    .forEach((node) => node.remove());
  root
    .querySelectorAll<HTMLTableElement>(
      ".gs-report-section .gs-report-table",
    )
    .forEach((table) => {
      const parsed = parseReportTable(table);
      if (!parsed) return;
      const svg = createAutoChart(parsed);
      if (!svg) return;
      const wrapper = document.createElement("div");
      wrapper.className = "gs-report-auto-chart";
      wrapper.appendChild(svg);
      const caption = document.createElement("p");
      caption.className = "gs-report-chart-caption";
      caption.textContent = "Visual summary · exact values in the table below";
      wrapper.appendChild(caption);
      table.closest(".gs-report-table-wrap")?.before(wrapper);
    });
}

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
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!mounted) return;

    const prepare = () => {
      const root = document.querySelector<HTMLElement>(
        `.gs-print-report[data-report-title="${CSS.escape(title)}"]`,
      );
      if (root) enhanceReportWithCharts(root);
    };

    prepare();
    const frame = window.requestAnimationFrame(prepare);
    window.addEventListener("beforeprint", prepare);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeprint", prepare);
    };
  }, [mounted, title, generatedAt, children]);

  const generatedLabel = generatedAt.toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const isPolish = locale.toLowerCase().startsWith("pl");
  const labels = isPolish
    ? {
        period: "Okres",
        currency: "Waluta",
        generated: "Wygenerowano",
        footer: "Raport wygenerowany przez GoSpots",
      }
    : {
        period: "Period",
        currency: "Currency",
        generated: "Generated",
        footer: "Report generated by GoSpots",
      };

  if (!mounted) return null;

  return createPortal(
    <div
      className="gs-print-report"
      data-report-title={title}
      aria-hidden="true"
    >
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
        {labels.footer} · {venueName} · {generatedLabel}
      </footer>
    </div>,
    document.body,
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
        {note ? (
          <span className="gs-report-section-note">{note}</span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}
