import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DashboardPageBody } from "./dashboard-page-body";
import { SectionInfoTip } from "./section-info-tip";

export function TenantPage({
  title,
  description,
  capabilities,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  capabilities?: readonly string[];
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <header className="relative z-30 shrink-0 overflow-visible border-b border-white/5 bg-zinc-950/80 px-6 py-3 backdrop-blur md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight text-white md:text-2xl">
              {title}
            </h1>
            <SectionInfoTip
              description={description}
              capabilities={capabilities}
            />
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      </header>
      <div
        className={cn(
          "relative z-0 min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-6 md:p-8",
          className,
        )}
      >
        <DashboardPageBody>{children}</DashboardPageBody>
      </div>
    </div>
  );
}
