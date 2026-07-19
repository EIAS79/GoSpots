"use client";

import { Check, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  DASHBOARD_ACCESS_GROUPS,
  hasPermInList,
  isGroupFullyEnabled,
  setGroupEnabled,
  togglePerm,
  type DashboardAccessGroup,
} from "@/lib/dashboard-access";

export function StaffAccessEditor({
  perms,
  onChange,
  assignablePermissions,
  disabled = false,
  compact = false,
}: {
  perms: string[];
  onChange: (perms: string[]) => void;
  assignablePermissions: string[];
  disabled?: boolean;
  compact?: boolean;
}) {
  const allowed = new Set(assignablePermissions);
  const visibleGroups = DASHBOARD_ACCESS_GROUPS.map((group) => ({
    ...group,
    toggles: group.toggles.filter((t) => allowed.has(t.perm)),
  })).filter((g) => g.toggles.length > 0);

  const [openId, setOpenId] = useState<string | null>(
    visibleGroups[0]?.id ?? null,
  );

  const enabledCount = useMemo(
    () =>
      visibleGroups.reduce(
        (n, g) =>
          n + g.toggles.filter((t) => hasPermInList(perms, t.perm)).length,
        0,
      ),
    [visibleGroups, perms],
  );
  const totalCount = useMemo(
    () => visibleGroups.reduce((n, g) => n + g.toggles.length, 0),
    [visibleGroups],
  );

  return (
    <div className={cn("space-y-3", compact && "space-y-2.5")}>
      {!disabled ? (
        <p className="text-[11px] text-zinc-500">
          {enabledCount}/{totalCount} permissions on
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/10">
        {visibleGroups.map((group, i) => (
          <AccessGroupAccordion
            key={group.id}
            group={group}
            perms={perms}
            disabled={disabled}
            open={openId === group.id}
            onToggleOpen={() =>
              setOpenId((cur) => (cur === group.id ? null : group.id))
            }
            onChange={onChange}
            isLast={i === visibleGroups.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function AccessGroupAccordion({
  group,
  perms,
  disabled,
  open,
  onToggleOpen,
  onChange,
  isLast,
}: {
  group: DashboardAccessGroup;
  perms: string[];
  disabled: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (perms: string[]) => void;
  isLast: boolean;
}) {
  const sectionOn = isGroupFullyEnabled(perms, group);
  const activeCount = group.toggles.filter((t) =>
    hasPermInList(perms, t.perm),
  ).length;
  const anyOn = activeCount > 0;

  return (
    <div className={cn(!isLast && "border-b border-white/10")}>
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 transition",
          anyOn ? "bg-emerald-500/[0.06]" : "bg-transparent",
        )}
      >
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            size={14}
            className={cn(
              "shrink-0 text-zinc-500 transition",
              open && "rotate-180 text-emerald-300",
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-white">
              {group.label}
            </span>
            <span className="block truncate text-[11px] text-zinc-500">
              {group.description}
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
              anyOn
                ? "bg-emerald-500/15 text-emerald-200"
                : "bg-white/5 text-zinc-500",
            )}
          >
            {activeCount}/{group.toggles.length}
          </span>
        </button>
        {!disabled ? (
          <button
            type="button"
            onClick={() => onChange(setGroupEnabled(perms, group, !sectionOn))}
            className={cn(
              "shrink-0 rounded-lg border px-2 py-1 text-[10px] font-medium",
              sectionOn
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                : "border-white/10 text-zinc-500 hover:text-zinc-300",
            )}
          >
            {sectionOn ? "All on" : "All"}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="flex flex-wrap gap-1.5 border-t border-white/5 bg-zinc-950/50 px-3 py-3">
          {group.toggles.map((toggle) => {
            const on = hasPermInList(perms, toggle.perm);
            return (
              <button
                key={toggle.perm}
                type="button"
                disabled={disabled}
                title={toggle.hint}
                onClick={() => onChange(togglePerm(perms, toggle.perm, !on))}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs transition",
                  on
                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                    : "border-white/10 bg-zinc-900/60 text-zinc-400 hover:border-white/20 hover:text-zinc-200",
                  disabled && "cursor-default opacity-70",
                )}
              >
                <span
                  className={cn(
                    "grid h-3.5 w-3.5 place-items-center rounded border",
                    on
                      ? "border-emerald-400 bg-emerald-500 text-zinc-950"
                      : "border-white/20",
                  )}
                >
                  {on ? <Check size={9} strokeWidth={3} /> : null}
                </span>
                <span>
                  {toggle.label}
                  {toggle.hint ? (
                    <span className="mt-0.5 block text-[10px] text-zinc-500">
                      {toggle.hint}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
