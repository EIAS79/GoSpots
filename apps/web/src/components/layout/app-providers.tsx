"use client";

import type { ReactNode } from "react";
import { AuroraBackground } from "@/components/effects/aurora-background";
import { ScrollProgress } from "@/components/effects/scroll-progress";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ConnectivityProvider } from "@/lib/connectivity-context";
import { AuthProvider } from "@/lib/use-auth";
import { PublicPrefsProvider } from "@/lib/public-prefs-context";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <PublicPrefsProvider>
        <AuthProvider>
          <ConnectivityProvider>
            <AuroraBackground />
            <ScrollProgress />
            {children}
          </ConnectivityProvider>
        </AuthProvider>
      </PublicPrefsProvider>
    </ThemeProvider>
  );
}
