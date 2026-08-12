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
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <header className="relative z-30 shrink-0 border-b border-white/5 bg-zinc-950/80 px-4 py-3 backdrop-blur sm:px-5 md:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 max-w-full items-center gap-2">
            <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-white md:text-2xl">
              {title}
            </h1>
            <SectionInfoTip
              description={description}
              capabilities={capabilities}
            />
          </div>
          {actions ? (
            <div className="flex w-full max-w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              {actions}
            </div>
          ) : null}
        </div>
      </header>
      <div
        className={cn(
          "relative z-0 min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain p-4 sm:p-5 md:p-6 lg:p-8",
          className,
        )}
      >
        <DashboardPageBody className="flex h-full min-h-0 flex-col">
          {children}
          <div
            aria-hidden="true"
            className="h-6 shrink-0 sm:h-8"
            data-dashboard-bottom-spacing
          />
        </DashboardPageBody>
      </div>
    </div>
  );
}
