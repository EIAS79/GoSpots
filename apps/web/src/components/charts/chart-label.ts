const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Format only canonical API calendar-day keys. Finance reports may already pass
 * localized labels (for example "Mon, Aug 10"); reparsing those labels by
 * appending a time suffix produced the literal "Invalid Date" on chart axes.
 */
export function formatChartDayLabel(label: string, locale?: string): string {
  const match = DATE_KEY_RE.exec(label);
  if (!match) return label;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  // Reject impossible calendar values rather than normalizing them silently.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return label;
  }

  return date.toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
