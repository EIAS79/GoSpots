"use client";

import type { ReactNode } from "react";
import { AuroraBackground } from "@/components/effects/aurora-background";
import { ScrollProgress } from "@/components/effects/scroll-progress";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { AuthProvider } from "@/lib/use-auth";
import { PublicPrefsProvider } from "@/lib/public-prefs-context";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <PublicPrefsProvider>
        <AuthProvider>
          <AuroraBackground />
          <ScrollProgress />
          {children}
        </AuthProvider>
      </PublicPrefsProvider>
    </ThemeProvider>
  );
}
