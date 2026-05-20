export function normalizeFloor(value: unknown, max = 10): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? 1), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.max(1, Math.floor(n)), Math.max(1, max));
}

export function floorLabel(floor: number): string {
  return `Floor ${floor}`;
}

export function floorRange(count: number): number[] {
  const n = Math.max(1, Math.min(10, Math.floor(count) || 1));
  return Array.from({ length: n }, (_, i) => i + 1);
}
