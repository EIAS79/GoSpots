export function elapsedMilliseconds(
  startedAt: string | Date,
  now: string | Date | number = Date.now(),
): number {
  const start = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  const current = typeof now === "number" ? now : now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(current)) return 0;
  return Math.max(0, current - start);
}

export function elapsedSeconds(
  startedAt: string | Date,
  now: string | Date | number = Date.now(),
): number {
  return Math.floor(elapsedMilliseconds(startedAt, now) / 1000);
}

export function formatElapsed(
  startedAt: string | Date,
  now: string | Date | number = Date.now(),
): string {
  const total = elapsedSeconds(startedAt, now);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}
