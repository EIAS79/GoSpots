import fs from 'node:fs';

function replaceOnce(path, from, to) {
  const current = fs.readFileSync(path, 'utf8');
  const first = current.indexOf(from);
  if (first < 0) {
    throw new Error(`Expected text not found in ${path}: ${JSON.stringify(from)}`);
  }
  if (current.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Expected exactly one match in ${path}: ${JSON.stringify(from)}`);
  }
  fs.writeFileSync(path, current.replace(from, to));
}

replaceOnce(
  'apps/web/src/components/layout/tenant-shell.tsx',
  'segment: "/guest-checks",\n        labelKey: "nav.guestChecks",',
  'segment: "/checkout",\n        labelKey: "nav.guestChecks",',
);

replaceOnce(
  'apps/web/src/lib/i18n.ts',
  'guestChecks: "Open tabs",',
  'guestChecks: "Checkout",',
);

replaceOnce(
  'apps/web/src/lib/i18n.ts',
  'guestChecks: "Otwarte rachunki",',
  'guestChecks: "Kasa",',
);
