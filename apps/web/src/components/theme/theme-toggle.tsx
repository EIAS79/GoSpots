"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePublicPrefsOptional } from "@/lib/public-prefs-context";
import { useTheme } from "./theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme, ready } = useTheme();
  const prefs = usePublicPrefsOptional();
  const label =
    theme === "dark"
      ? prefs?.t("theme.switchToLight") ?? "Switch to light mode"
      : prefs?.t("theme.switchToDark") ?? "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      disabled={!ready}
      aria-label={label}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/80 text-[var(--color-foreground)] shadow-sm backdrop-blur transition hover:border-amber-500/40 hover:text-amber-600 dark:hover:border-amber-400/35 dark:hover:text-amber-300",
        className,
      )}
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
