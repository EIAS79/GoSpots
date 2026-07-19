"use client";

import type { ReactNode } from "react";
import { AuroraBackground } from "@/components/effects/aurora-background";
import { ScrollProgress } from "@/components/effects/scroll-progress";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { AuthProvider } from "@/lib/use-auth";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuroraBackground />
        <ScrollProgress />
        {children}
      </AuthProvider>
    </ThemeProvider>
  );
}
