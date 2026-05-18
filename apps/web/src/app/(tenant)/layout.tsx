import { TenantShell } from "@/components/layout/tenant-shell";
import type { ReactNode } from "react";

export default function TenantLayout({ children }: { children: ReactNode }) {
  return <TenantShell>{children}</TenantShell>;
}
