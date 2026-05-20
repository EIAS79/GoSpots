import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Constrains dashboard page content to the viewport (no horizontal bleed). */
export function DashboardPageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full min-w-0 max-w-6xl", className)}>
      {children}
    </div>
  );
}
