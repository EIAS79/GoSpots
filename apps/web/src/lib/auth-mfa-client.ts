import { api } from "./api";
import type { AuthSessionResponse } from "./auth-client";

export type MfaStatus = {
  totpEnabled: boolean;
  recoveryCodesRemaining: number;
};

export type MfaTotpBeginResponse = {
  otpauthUri: string;
  secret: string;
};

export type MfaRecoveryCodesResponse = {
  recoveryCodes: string[];
};

export type MfaLoginChallenge = {
  mfaRequired: true;
  mfaToken: string;
};

export type LoginOrMfaResponse = AuthSessionResponse | MfaLoginChallenge;

export function isMfaLoginChallenge(
  value: LoginOrMfaResponse,
): value is MfaLoginChallenge {
  return (
    typeof value === "object" &&
    value != null &&
    "mfaRequired" in value &&
    (value as MfaLoginChallenge).mfaRequired === true &&
    typeof (value as MfaLoginChallenge).mfaToken === "string"
  );
}

export function fetchMfaStatus() {
  return api<MfaStatus>("/auth/mfa/status", { method: "GET" });
}

export function beginMfaTotp(password: string) {
  return api<MfaTotpBeginResponse>("/auth/mfa/totp/begin", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function confirmMfaTotp(code: string) {
  return api<MfaRecoveryCodesResponse>("/auth/mfa/totp/confirm", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function disableMfaTotp(input: {
  password: string;
  code?: string;
  recoveryCode?: string;
}) {
  return api<{ ok: true }>("/auth/mfa/totp/disable", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function regenerateMfaRecoveryCodes(input: {
  password: string;
  code?: string;
  recoveryCode?: string;
}) {
  return api<MfaRecoveryCodesResponse>("/auth/mfa/recovery/regenerate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function verifyMfaLogin(input: {
  mfaToken: string;
  code?: string;
  recoveryCode?: string;
}) {
  return api<AuthSessionResponse>("/auth/mfa/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function mfaErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Something went wrong.";
}
