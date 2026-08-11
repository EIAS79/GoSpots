import { VenueGate } from "@/components/layout/venue-gate";
import { OfflineContextBridge } from "@/components/offline/offline-context-bridge";
import type { ReactNode } from "react";
export default function KdsLayout({children}:{children:ReactNode}){return <VenueGate><OfflineContextBridge/><main className="min-h-screen bg-zinc-950 text-zinc-100">{children}</main></VenueGate>;}
