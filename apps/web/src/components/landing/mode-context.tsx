"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type Mode = "play" | "manage";

type ModeContextValue = {
  mode: Mode;
  setMode: (m: Mode) => void;
};

const ModeContext = createContext<ModeContextValue | null>(null);

export function ModeProvider({
  children,
  initial = "play",
}: {
  children: ReactNode;
  initial?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initial);
  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error("useMode must be used inside <ModeProvider>");
  return ctx;
}
