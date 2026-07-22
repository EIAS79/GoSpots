"use client";

import { useEffect, useRef } from "react";
import { getApiBaseUrl } from "./api-base-url";

export type NotificationsSsePayload = {
  id: string;
  section: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
};

type Options = {
  enabled?: boolean;
  onNotification?: (payload: NotificationsSsePayload) => void;
  onReady?: () => void;
  onError?: () => void;
};

/**
 * Cookie-auth EventSource for `GET /notifications/stream`.
 * Polling callers should keep their interval as multi-instance fallback.
 */
export function useNotificationsSse(options: Options = {}) {
  const {
    enabled = true,
    onNotification,
    onReady,
    onError,
  } = options;

  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (typeof EventSource === "undefined") return;

    const url = `${getApiBaseUrl()}/notifications/stream`;
    const es = new EventSource(url, { withCredentials: true });

    const onReadyEvt = () => {
      onReadyRef.current?.();
    };
    const onNotificationEvt = (evt: MessageEvent) => {
      try {
        const data = JSON.parse(String(evt.data)) as NotificationsSsePayload;
        if (data?.id) onNotificationRef.current?.(data);
      } catch {
        /* ignore malformed */
      }
    };
    const onErr = () => {
      onErrorRef.current?.();
    };

    es.addEventListener("ready", onReadyEvt);
    es.addEventListener("notification", onNotificationEvt);
    es.addEventListener("error", onErr);

    return () => {
      es.removeEventListener("ready", onReadyEvt);
      es.removeEventListener("notification", onNotificationEvt);
      es.removeEventListener("error", onErr);
      es.close();
    };
  }, [enabled]);
}
