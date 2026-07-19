import type { ReactNode } from "react";

/** Auth lives in root AppProviders; dashboard routes only add venue shell. */
export default function TenantLayout({ children }: { children: ReactNode }) {
  return children;
}
