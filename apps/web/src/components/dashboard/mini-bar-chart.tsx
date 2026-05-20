type Point = { label: string; value: number };

export function MiniBarChart({
  data,
  className = "",
}: {
  data: Point[];
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div
      className={`min-w-0 overflow-hidden ${className}`}
      role="img"
      aria-label="Bar chart"
    >
      <div className="flex h-32 min-w-0 items-end gap-1 sm:gap-1.5">
        {data.map((d) => (
          <div
            key={d.label}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <div className="relative flex h-full w-full min-w-0 flex-1 items-end">
              <div
                className="w-full min-w-0 rounded-t bg-gradient-to-t from-emerald-600/80 to-emerald-400/60"
                style={{
                  height: `${(d.value / max) * 100}%`,
                  minHeight: d.value ? 4 : 0,
                }}
                title={`${d.label}: ${d.value}`}
              />
            </div>
            <span className="w-full truncate text-center text-[9px] text-zinc-500">
              {d.label.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
