/**
 * Client-visible hardware diagnostics are intentionally allowlisted.
 * Stored provider/adapter errors stay in the database for authorized server-side
 * troubleshooting, but must never be echoed to a browser.
 */
export function safePrintDiagnostic(
  code: string | null | undefined,
  detail: string | null | undefined,
  claimedAt?: Date | string | null,
): { lastErrorCode: string | null; lastError: string | null } {
  switch (code) {
    case 'EDGE_PRINT_OUTCOME_UNKNOWN':
    case 'EDGE_PRINT_LEASE_EXPIRED':
      return {
        lastErrorCode: code,
        lastError:
          'Physical print outcome is uncertain. Inspect output before any action.',
      };
    case 'UNSUPPORTED_PRINTER_ADAPTER':
      return {
        lastErrorCode: code,
        lastError:
          'Printer adapter is unsupported. Check the printer configuration.',
      };
  }
  if (!code && !detail) return { lastErrorCode: null, lastError: null };
  return {
    lastErrorCode: 'PRINT_ERROR_REVIEW',
    lastError: claimedAt
      ? 'Printing was attempted. Verify physical output and contact a supervisor.'
      : 'Printer operation failed. Review the device configuration with an administrator.',
  };
}

export function safePrinterDiagnostic(
  detail: string | null | undefined,
): string | null {
  return detail
    ? 'Printer reported a configuration or connection issue. Check the device.'
    : null;
}
