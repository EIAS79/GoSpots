/**
 * Compare en vs pl translation keys in dashboard + public catalogs.
 * Exits non-zero when either locale is missing keys the other has.
 *
 * Usage: pnpm --filter @gospots/web run i18n:check
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

const DASHBOARD = path.join(webRoot, "src/lib/i18n.ts");
const PUBLIC = path.join(webRoot, "src/lib/public-i18n.ts");

/**
 * @param {string} source
 * @param {string} name  e.g. "en" or "pl"
 * @returns {string} object literal including outer braces
 */
function extractObjectLiteral(source, name) {
  const patterns = [
    new RegExp(`const\\s+${name}\\s*:\\s*Dict(?:Tree)?\\s*=\\s*\\{`),
    new RegExp(`const\\s+${name}\\s*=\\s*\\{`),
  ];
  let start = -1;
  for (const re of patterns) {
    const m = re.exec(source);
    if (m) {
      start = m.index + m[0].length - 1; // position of '{'
      break;
    }
  }
  if (start < 0) {
    throw new Error(`Could not find const ${name} object literal`);
  }

  let depth = 0;
  let inStr = null; // " or '
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unbalanced braces for const ${name}`);
}

/**
 * Evaluate a catalog object literal. Supports `...en` spreads by injecting the en object.
 * @param {string} literal
 * @param {Record<string, unknown> | null} enObj
 */
function evalCatalog(literal, enObj) {
  const cleaned = literal
    // strip line comments outside strings — crude but fine for our catalogs
    .replace(/^\s*\/\/.*$/gm, "");
  try {
    if (enObj != null && /\.\.\.\s*en\b/.test(cleaned)) {
      const withParam = cleaned.replace(/\.\.\.\s*en\b/g, "...__en");
      // eslint-disable-next-line no-new-func
      return new Function("__en", `return (${withParam});`)(enObj);
    }
    // eslint-disable-next-line no-new-func
    return new Function(`return (${cleaned});`)();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to evaluate catalog literal: ${msg}`);
  }
}

/**
 * Flatten nested dict trees / flat dicts to leaf key paths.
 * Arrays count as a single leaf (guide.*.caps).
 * @param {unknown} node
 * @param {string} prefix
 * @param {Set<string>} out
 */
function collectLeafKeys(node, prefix, out) {
  if (node == null) return;
  if (typeof node === "string" || Array.isArray(node)) {
    if (prefix) out.add(prefix);
    return;
  }
  if (typeof node !== "object") return;
  for (const [k, v] of Object.entries(node)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      collectLeafKeys(v, next, out);
    } else {
      out.add(next);
    }
  }
}

/**
 * @param {string} label
 * @param {string} filePath
 */
function checkFile(label, filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const enLit = extractObjectLiteral(source, "en");
  const plLit = extractObjectLiteral(source, "pl");
  const enObj = evalCatalog(enLit, null);
  const plObj = evalCatalog(plLit, enObj);

  const enKeys = new Set();
  const plKeys = new Set();
  collectLeafKeys(enObj, "", enKeys);
  collectLeafKeys(plObj, "", plKeys);

  const missingInPl = [...enKeys].filter((k) => !plKeys.has(k)).sort();
  const missingInEn = [...plKeys].filter((k) => !enKeys.has(k)).sort();

  return {
    label,
    file: path.relative(webRoot, filePath).replace(/\\/g, "/"),
    enCount: enKeys.size,
    plCount: plKeys.size,
    missingInPl,
    missingInEn,
  };
}

function printDiff(title, keys) {
  if (keys.length === 0) return;
  console.error(`\n  ${title} (${keys.length}):`);
  const max = 40;
  for (const k of keys.slice(0, max)) {
    console.error(`    - ${k}`);
  }
  if (keys.length > max) {
    console.error(`    … and ${keys.length - max} more`);
  }
}

const results = [checkFile("dashboard (i18n.ts)", DASHBOARD), checkFile("public (public-i18n.ts)", PUBLIC)];

let failed = false;
let totalMissing = 0;

for (const r of results) {
  const miss = r.missingInPl.length + r.missingInEn.length;
  totalMissing += miss;
  const status = miss === 0 ? "OK" : "FAIL";
  if (miss > 0) failed = true;

  console.log(
    `[${status}] ${r.label} — ${r.file}: en=${r.enCount} pl=${r.plCount} keys`,
  );
  printDiff("Missing in pl (present in en)", r.missingInPl);
  printDiff("Missing in en (present in pl)", r.missingInEn);
}

console.log(
  failed
    ? `\ni18n:check failed — ${totalMissing} key mismatch(es) across catalogs.`
    : `\ni18n:check passed — en/pl leaf keys match in both catalogs.`,
);

process.exit(failed ? 1 : 0);
