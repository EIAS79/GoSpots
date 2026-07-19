import { api } from "./api";

export type ContactMessageRow = {
  id: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  subject: string | null;
  message: string;
  createdAt: string;
};

export function fetchContactMessages(opts?: { take?: number; skip?: number }) {
  const params = new URLSearchParams();
  if (opts?.take) params.set("take", String(opts.take));
  if (opts?.skip) params.set("skip", String(opts.skip));
  const qs = params.toString();
  return api<{
    items: ContactMessageRow[];
    total: number;
    take: number;
    skip: number;
  }>(`/contact-messages${qs ? `?${qs}` : ""}`);
}
