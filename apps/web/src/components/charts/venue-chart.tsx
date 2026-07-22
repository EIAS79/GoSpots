"use client";

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { useMemo } from "react";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
);

const gridColor = "rgba(255,255,255,0.06)";
const tickColor = "rgba(161,161,170,0.9)";

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    duration: 900,
    easing: "easeOutQuart" as const,
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(24,24,27,0.95)",
      borderColor: "rgba(255,255,255,0.1)",
      borderWidth: 1,
      titleColor: "#fafafa",
      bodyColor: "#d4d4d8",
      padding: 10,
    },
  },
  scales: {
    x: {
      grid: { color: gridColor },
      ticks: { color: tickColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
    },
    y: {
      grid: { color: gridColor },
      ticks: { color: tickColor },
      beginAtZero: true,
    },
  },
};

function formatDayLabel(day: string) {
  if (day.length < 10) return day;
  const d = new Date(day + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

export type ChartPoint = { label: string; value: number };

export function VenueBarChart({
  data,
  label = "Value",
  color = "rgba(52, 211, 153, 0.85)",
}: {
  data: ChartPoint[];
  label?: string;
  color?: string;
}) {
  const vs = useVenueSettingsOptional();
  const chartData = useMemo(
    () => ({
      labels: data.map((d) => formatDayLabel(d.label)),
      datasets: [
        {
          label,
          data: data.map((d) => d.value),
          backgroundColor: color,
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    }),
    [data, label, color],
  );

  if (data.length === 0) {
    return (
      <p className="flex h-48 items-center justify-center text-sm text-zinc-500">
        {vs?.t("charts.noDataPeriod") ?? "No data for this period."}
      </p>
    );
  }

  return (
    <div className="h-48 min-h-[12rem] w-full min-w-0">
      <Bar data={chartData} options={baseOptions} />
    </div>
  );
}

export function VenueLineChart({
  data,
  label = "Value",
  color = "rgba(52, 211, 153, 1)",
}: {
  data: ChartPoint[];
  label?: string;
  color?: string;
}) {
  const vs = useVenueSettingsOptional();
  const chartData = useMemo(
    () => ({
      labels: data.map((d) => formatDayLabel(d.label)),
      datasets: [
        {
          label,
          data: data.map((d) => d.value),
          borderColor: color,
          backgroundColor: color.replace("1)", "0.15)").replace("0.85)", "0.15)"),
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    }),
    [data, label, color],
  );

  if (data.length === 0) {
    return (
      <p className="flex h-48 items-center justify-center text-sm text-zinc-500">
        {vs?.t("charts.noDataPeriod") ?? "No data for this period."}
      </p>
    );
  }

  return (
    <div className="h-48 min-h-[12rem] w-full min-w-0">
      <Line data={chartData} options={baseOptions} />
    </div>
  );
}

export function VenueMultiBarChart({
  labels,
  datasets,
}: {
  labels: string[];
  datasets: { label: string; data: number[]; color: string }[];
}) {
  const chartData = useMemo(
    () => ({
      labels: labels.map(formatDayLabel),
      datasets: datasets.map((ds) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: ds.color,
        borderRadius: 4,
      })),
    }),
    [labels, datasets],
  );

  return (
    <div className="h-56 min-h-[14rem] w-full min-w-0">
      <Bar
        data={chartData}
        options={{
          ...baseOptions,
          plugins: {
            ...baseOptions.plugins,
            legend: {
              display: true,
              position: "bottom" as const,
              labels: { color: tickColor, boxWidth: 12, padding: 12 },
            },
          },
          scales: {
            ...baseOptions.scales,
            x: { ...baseOptions.scales.x, stacked: true },
            y: { ...baseOptions.scales.y, stacked: true },
          },
        }}
      />
    </div>
  );
}

export function VenueDoughnutChart({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const vs = useVenueSettingsOptional();
  const chartData = useMemo(
    () => ({
      labels: data.map((d) => d.label),
      datasets: [
        {
          data: data.map((d) => d.value),
          backgroundColor: data.map((d) => d.color),
          borderWidth: 0,
        },
      ],
    }),
    [data],
  );

  if (data.every((d) => d.value === 0)) {
    return (
      <p className="flex h-48 items-center justify-center text-sm text-zinc-500">
        {vs?.t("charts.noData") ?? "No data."}
      </p>
    );
  }

  return (
    <div className="mx-auto h-48 w-full max-w-xs min-w-0">
      <Doughnut
        data={chartData}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 900, easing: "easeOutQuart" },
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: tickColor, padding: 8 },
            },
          },
        }}
      />
    </div>
  );
}
