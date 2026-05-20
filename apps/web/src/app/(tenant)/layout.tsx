import { AuthProvider } from "@/lib/use-auth";
import type { ReactNode } from "react";

export default function TenantLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
