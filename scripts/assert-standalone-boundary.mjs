import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const forbiddenTerms = [
  ['go', 'pos'].join(''),
  ['go', '_', 'pos'].join(''),
  ['go', '-', 'pos'].join(''),
];

const tracked = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
}).split('\0').filter(Boolean);

const violations = [];

for (const path of tracked) {
  const buffer = readFileSync(path);
  if (buffer.includes(0)) continue;

  const lines = buffer.toString('utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lower = lines[index].toLowerCase();
    const matched = forbiddenTerms.find((term) => lower.includes(term));
    if (matched) {
      violations.push(`${path}:${index + 1}: ${lines[index].trim()}`);
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

console.log(
  `Standalone product boundary passed across ${tracked.length} tracked files.`,
);
