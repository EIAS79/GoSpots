"use client";

import type { ReactNode } from "react";
import { AuroraBackground } from "@/components/effects/aurora-background";
import { ScrollProgress } from "@/components/effects/scroll-progress";
import { ServiceWorkerRegister } from "@/components/offline/service-worker-register";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ConnectivityProvider } from "@/lib/connectivity-context";
import type { DomainPublicDefaults } from "@/lib/domain-defaults";
import { PublicPrefsProvider } from "@/lib/public-prefs-context";
import { AuthProvider } from "@/lib/use-auth";

export function AppProviders({
  children,
  publicDefaults,
}: {
  children: ReactNode;
  publicDefaults: DomainPublicDefaults;
}) {
  return (
    <ThemeProvider>
      <PublicPrefsProvider
        defaultLocale={publicDefaults.locale}
        defaultCurrency={publicDefaults.currency}
      >
        <AuthProvider>
          <ConnectivityProvider>
            <ServiceWorkerRegister />
            <AuroraBackground />
            <ScrollProgress />
            {children}
          </ConnectivityProvider>
        </AuthProvider>
      </PublicPrefsProvider>
    </ThemeProvider>
  );
}
