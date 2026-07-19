export const DEFAULT_NO_SHOW_MINUTES = 30;

/** @deprecated use DEFAULT_NO_SHOW_MINUTES */

export const DEFAULT_DINING_NO_SHOW_MINUTES = DEFAULT_NO_SHOW_MINUTES;



export function parseNoShowMinutes(

  offeringConfig: Record<string, unknown> | null | undefined,

): number {

  const raw = offeringConfig?.noShowMinutes;

  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);

  if (n >= 5 && n <= 180) return Math.floor(n);

  return DEFAULT_NO_SHOW_MINUTES;

}



/** @deprecated use parseNoShowMinutes */

export const parseDiningNoShowMinutes = parseNoShowMinutes;



export function holdEndIso(startsAtIso: string, noShowMinutes: number): string {

  const start = new Date(startsAtIso);

  return new Date(start.getTime() + noShowMinutes * 60_000).toISOString();

}



/** @deprecated use holdEndIso */

export const diningHoldEndIso = holdEndIso;



export function holdEndFromLocal(

  date: string,

  time: string,

  noShowMinutes: number,

): string {

  const start = new Date(`${date}T${time}`);

  return new Date(start.getTime() + noShowMinutes * 60_000).toISOString();

}



/** @deprecated use holdEndFromLocal */

export const diningHoldEndFromLocal = holdEndFromLocal;



export const NO_SHOW_OPTIONS = [15, 30, 45, 60, 90] as const;

/** @deprecated use NO_SHOW_OPTIONS */

export const DINING_NO_SHOW_OPTIONS = NO_SHOW_OPTIONS;

