import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const forbiddenTerms = [
  ['go', 'pos'].join(''),
  ['go', '_', 'pos'].join(''),
  ['go', '-', 'pos'].join(''),
];

// Applied Prisma migrations are immutable deployment history. This migration's
// first-line historical label predates the standalone product reset; rewriting
// it would create migration-checksum drift. Runtime code/config/UI/docs receive
// no exception.
const immutableHistoricalFiles = new Set([
  'apps/api/prisma/migrations/20260811160000_chunk22_integrations/migration.sql',
]);

const tracked = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
}).split('\0').filter(Boolean);

const violations = [];
const historicalMatches = [];

for (const path of tracked) {
  const buffer = readFileSync(path);
  if (buffer.includes(0)) continue;

  const lines = buffer.toString('utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lower = lines[index].toLowerCase();
    const matched = forbiddenTerms.find((term) => lower.includes(term));
    if (!matched) continue;

    const occurrence = `${path}:${index + 1}: ${lines[index].trim()}`;
    if (immutableHistoricalFiles.has(path)) {
      historicalMatches.push(occurrence);
    } else {
      violations.push(occurrence);
    }
  }
}

if (violations.length > 0) {
  console.error(
    'Standalone product boundary failed: removed external-POS provider references remain in tracked files.',
  );
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

for (const occurrence of historicalMatches) {
  console.log(`Preserved immutable migration-history occurrence: ${occurrence}`);
}
console.log(
  `Standalone product boundary passed across ${tracked.length} tracked files.`,
);
