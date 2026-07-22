import { ApiError } from "./api";
import { getApiBaseUrl } from "./api-base-url";

export type GuestChatStatus = "WAITING" | "OPEN" | "PAUSED" | "ENDED";
export type GuestChatSender = "GUEST" | "STAFF";

export type GuestChatMessage = {
  id: string;
  sender: GuestChatSender;
  staffUserId: string | null;
  body: string;
  createdAt: string;
};

export type GuestChat = {
  id: string;
  guestToken?: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  status: GuestChatStatus;
  staffJoinedAt: string | null;
  staffUserId: string | null;
  lastGuestPingAt: string | null;
  endedAt: string | null;
  endedBy: GuestChatSender | null;
  createdAt: string;
  updatedAt: string;
  messages: GuestChatMessage[];
  venueName?: string;
  venueSlug?: string;
  canGuestChat?: boolean;
  canGuestPing?: boolean;
};

const TOKEN_KEY = (slug: string) => `Locora-guest-chat:${slug}`;

export function readGuestChatToken(slug: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY(slug));
  } catch {
    return null;
  }
}

export function writeGuestChatToken(slug: string, token: string) {
  try {
    window.localStorage.setItem(TOKEN_KEY(slug), token);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearGuestChatToken(slug: string) {
  try {
    window.localStorage.removeItem(TOKEN_KEY(slug));
  } catch {
    /* ignore */
  }
}

async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const message =
      (payload as { message?: string | string[] })?.message &&
      (Array.isArray((payload as { message?: string[] }).message)
        ? (payload as { message: string[] }).message.join(", ")
        : (payload as { message: string }).message) ||
      `Request failed: ${res.status}`;
    throw new ApiError(message, res.status, payload);
  }
  return payload as T;
}

export function createPublicGuestChat(
  slug: string,
  body: {
    guestName: string;
    guestEmail?: string;
    guestPhone?: string;
    message?: string;
    privacyConsentAccepted: boolean;
    /** Optional; required only when API CAPTCHA_PROVIDER is enforced. */
    captchaToken?: string;
  },
) {
  return publicFetch<{
    ok: boolean;
    message: string;
    guestToken: string;
    chat: GuestChat;
  }>(`/public/venues/${encodeURIComponent(slug)}/chats`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchPublicGuestChat(slug: string, token: string) {
  return publicFetch<GuestChat>(
    `/public/venues/${encodeURIComponent(slug)}/chats/${encodeURIComponent(token)}`,
  );
}

export function sendPublicGuestChatMessage(
  slug: string,
  token: string,
  message: string,
) {
  return publicFetch<GuestChatMessage>(
    `/public/venues/${encodeURIComponent(slug)}/chats/${encodeURIComponent(token)}/messages`,
    { method: "POST", body: JSON.stringify({ message }) },
  );
}

export function pingPublicGuestChat(slug: string, token: string) {
  return publicFetch<{ ok: boolean; message: string }>(
    `/public/venues/${encodeURIComponent(slug)}/chats/${encodeURIComponent(token)}/ping`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function endPublicGuestChat(slug: string, token: string) {
  return publicFetch<GuestChat>(
    `/public/venues/${encodeURIComponent(slug)}/chats/${encodeURIComponent(token)}/end`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function deletePublicGuestChat(slug: string, token: string) {
  return publicFetch<{ ok: boolean }>(
    `/public/venues/${encodeURIComponent(slug)}/chats/${encodeURIComponent(token)}`,
    { method: "DELETE" },
  );
}
