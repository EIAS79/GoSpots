"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import {
  resolvePublicCaptchaConfig,
  type PublicCaptchaProvider,
} from "@/lib/public-captcha";
import { usePublicPrefs } from "@/lib/public-prefs-context";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
      size?: "normal" | "compact" | "flexible";
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

type HCaptchaApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      size?: "normal" | "compact" | "invisible";
      theme?: "light" | "dark";
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    hcaptcha?: HCaptchaApi;
  }
}

const SCRIPT_SRC: Record<PublicCaptchaProvider, string> = {
  turnstile:
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
  hcaptcha: "https://js.hcaptcha.com/1/api.js?render=explicit",
};

const scriptPromises = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const existing = scriptPromises.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("no document"));
      return;
    }
    const found = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (found) {
      if (found.dataset.loaded === "1") {
        resolve();
        return;
      }
      found.addEventListener("load", () => resolve(), { once: true });
      found.addEventListener(
        "error",
        () => reject(new Error("captcha script failed")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error("captcha script failed"));
    document.head.appendChild(script);
  });

  scriptPromises.set(src, promise);
  return promise;
}

/**
 * Optional Turnstile / hCaptcha widget for public create forms.
 * Renders nothing when NEXT_PUBLIC_CAPTCHA_PROVIDER is off/unset or site key missing.
 */
export function PublicCaptchaWidget({
  onTokenChange,
  resetKey = 0,
  className,
}: {
  onTokenChange: (token: string | null) => void;
  /** Bump after submit so the challenge can be reused. */
  resetKey?: number;
  className?: string;
}) {
  const { t } = usePublicPrefs();
  const config = resolvePublicCaptchaConfig();
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  const provider = config?.provider ?? null;
  const siteKey = config?.siteKey ?? null;

  useEffect(() => {
    if (!provider || !siteKey) {
      onTokenChangeRef.current(null);
      return;
    }

    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    const clearWidget = () => {
      const id = widgetIdRef.current;
      widgetIdRef.current = null;
      if (!id) {
        host.replaceChildren();
        return;
      }
      try {
        if (provider === "turnstile") {
          window.turnstile?.remove(id);
        } else {
          window.hcaptcha?.remove(id);
        }
      } catch {
        /* ignore */
      }
      host.replaceChildren();
    };

    void (async () => {
      try {
        await loadScript(SCRIPT_SRC[provider]);
        if (cancelled || !hostRef.current) return;

        clearWidget();
        onTokenChangeRef.current(null);

        const onToken = (token: string) => onTokenChangeRef.current(token);
        const onClear = () => onTokenChangeRef.current(null);

        if (provider === "turnstile") {
          const api = window.turnstile;
          if (!api) throw new Error("turnstile missing");
          widgetIdRef.current = api.render(hostRef.current, {
            sitekey: siteKey,
            callback: onToken,
            "expired-callback": onClear,
            "error-callback": onClear,
            theme: "auto",
            size: "flexible",
          });
        } else {
          const api = window.hcaptcha;
          if (!api) throw new Error("hcaptcha missing");
          widgetIdRef.current = api.render(hostRef.current, {
            sitekey: siteKey,
            callback: onToken,
            "expired-callback": onClear,
            "error-callback": onClear,
            size: "normal",
            theme: "dark",
          });
        }
      } catch {
        if (!cancelled) onTokenChangeRef.current(null);
      }
    })();

    return () => {
      cancelled = true;
      clearWidget();
    };
  }, [provider, siteKey, resetKey]);

  if (!config) return null;

  return (
    <div
      className={cn("min-h-[65px]", className)}
      data-captcha-provider={config.provider}
    >
      <div ref={hostRef} />
      <span className="sr-only">{t("venuePage.captcha.label")}</span>
    </div>
  );
}
