import { api, ApiError } from "./api";
import { downloadTextFile } from "./export-report";

/** Shop-scoped personal-data package from `GET /gdpr/export` (owner only). */
export type GdprExportPackage = Record<string, unknown>;

export const GDPR_ERASE_ENTITY_TYPES = [
  "reservation",
  "eventRequest",
  "guestChat",
  "contactMessage",
  "venueReview",
] as const;

export type GdprEraseEntityType = (typeof GDPR_ERASE_ENTITY_TYPES)[number];

export type EraseGuestPayload = {
  entityType: GdprEraseEntityType;
  entityId: string;
  /** Owner account password — required for forced reauth. */
  password: string;
};

export type EraseGuestResult = {
  ok: true;
  shopId: string;
  entityType: GdprEraseEntityType;
  entityId: string;
  redactedFields: string[];
  placeholder: string;
  meta: {
    erasedAt: string;
    requestedByUserId: string;
    limitations: string[];
  };
};

export type EraseGuestByEmailResult = {
  ok: true;
  shopId: string;
  counts: Record<string, number>;
  meta: {
    erasedAt: string;
    requestedByUserId: string;
    limitations: string[];
  };
};

export type EraseAccountResult = {
  ok: true;
  userId: string;
  ownedShopsRedacted: number;
  meta: { erasedAt: string; limitations: string[] };
};

export type GuestDsarItem = {
  id: string;
  type: "ACCESS" | "ERASURE";
  status: string;
  guestEmail: string;
  guestName: string | null;
  message: string | null;
  createdAt: string;
  closedAt: string | null;
};

export async function fetchGdprExport(): Promise<GdprExportPackage> {
  return api<GdprExportPackage>("/gdpr/export");
}

/** Fetches the GDPR JSON package and triggers a browser download. */
export async function downloadGdprExportJson(): Promise<void> {
  const pack = await fetchGdprExport();
  const stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(
    `GoSpots-data-export-${stamp}.json`,
    `${JSON.stringify(pack, null, 2)}\n`,
    "application/json;charset=utf-8",
  );
}

/** Owner-only guest PII redact for one entity in the current shop. */
export async function eraseGuest(
  payload: EraseGuestPayload,
): Promise<EraseGuestResult> {
  return api<EraseGuestResult>("/gdpr/erase-guest", {
    method: "POST",
    body: JSON.stringify({
      entityType: payload.entityType,
      entityId: payload.entityId.trim(),
      password: payload.password,
    }),
  });
}

export async function eraseGuestByEmail(payload: {
  guestEmail: string;
  password: string;
}): Promise<EraseGuestByEmailResult> {
  return api<EraseGuestByEmailResult>("/gdpr/erase-guest-email", {
    method: "POST",
    body: JSON.stringify({
      guestEmail: payload.guestEmail.trim(),
      password: payload.password,
    }),
  });
}

export async function eraseAccount(payload: {
  password: string;
  confirmPhrase: string;
}): Promise<EraseAccountResult> {
  return api<EraseAccountResult>("/gdpr/erase-account", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listGuestDsar(): Promise<{ items: GuestDsarItem[] }> {
  return api<{ items: GuestDsarItem[] }>("/gdpr/dsar");
}

export async function closeGuestDsar(payload: {
  id: string;
  password: string;
}): Promise<{ ok: true; id: string; status: string }> {
  return api(`/gdpr/dsar/${encodeURIComponent(payload.id)}/close`, {
    method: "POST",
    body: JSON.stringify({ password: payload.password }),
  });
}

export async function submitPublicGuestDsar(
  slug: string,
  payload: {
    type: "ACCESS" | "ERASURE";
    guestEmail: string;
    guestName?: string;
    message?: string;
    privacyConsentAccepted: boolean;
    captchaToken?: string;
  },
): Promise<{ ok: true; id: string; message: string }> {
  return api(`/public/venues/${encodeURIComponent(slug)}/gdpr/dsar`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function gdprExportErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Could not download data export.";
}

export function gdprEraseErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Could not erase guest data.";
}
