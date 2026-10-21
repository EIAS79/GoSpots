#!/usr/bin/env node
/**
 * Offline, dependency-free validator for the explicit JSON Schema subset used by
 * release-manifest.schema.json. No network, signing or production access.
 *
 * --mode shape   validates structure only, including deliberate UNVERIFIED values.
 * --mode release additionally requires independently supplied GO evidence.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(dir, '../../docs/release-governance/release-manifest.schema.json');
const supportedKeywords = new Set([
  '$schema', '$id', 'title', '$defs', 'type', 'additionalProperties',
  'properties', 'required', 'const', 'enum', 'pattern', 'minimum',
  'minLength', 'minItems', 'items', '$ref', 'description',
]);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const field = (path, key) => `${path}.${key}`;

function collectSchemaProblems(spec, path = '$schema', errors = []) {
  if (!isObject(spec)) return [...errors, `${path}: schema node must be an object`];
  for (const key of Object.keys(spec)) {
    if (!supportedKeywords.has(key)) errors.push(`${path}: unsupported schema keyword ${key}`);
  }
  for (const [k, child] of Object.entries(spec.properties ?? {})) {
    collectSchemaProblems(child, field(path, k), errors);
  }
  for (const [k, child] of Object.entries(spec.$defs ?? {})) {
    collectSchemaProblems(child, field(path, k), errors);
  }
  if (spec.items) collectSchemaProblems(spec.items, field(path, 'items'), errors);
  return errors;
}

function matchesType(value, type) {
  switch (type) {
    case 'null': return value === null;
    case 'object': return isObject(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'integer': return Number.isSafeInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'boolean': return typeof value === 'boolean';
    default: throw new Error(`Unsupported schema type: ${type}`);
  }
}

function validateNode(value, spec, path, root, errors) {
  if (spec.$ref) {
    const parts = spec.$ref.split('/');
    if (parts.length !== 3 || parts[0] !== '#' || parts[1] !== '$defs' || !root.$defs[parts[2]]) {
      errors.push(`${path}: unresolved schema reference`);
      return;
    }
    validateNode(value, root.$defs[parts[2]], path, root, errors);
    return;
  }
  if ('const' in spec && value !== spec.const) errors.push(`${path}: incorrect constant`);
  if (spec.enum && !spec.enum.includes(value)) errors.push(`${path}: not an allowed value`);
  const types = spec.type ? (Array.isArray(spec.type) ? spec.type : [spec.type]) : [];
  if (types.length && !types.some((type) => matchesType(value, type))) {
    errors.push(`${path}: wrong type`);
    return;
  }
  if (value === null) return;
  if (typeof value === 'string') {
    if (spec.minLength != null && value.length < spec.minLength) errors.push(`${path}: too short`);
    if (spec.pattern && !new RegExp(spec.pattern).test(value)) errors.push(`${path}: pattern mismatch`);
  }
  if (typeof value === 'number' && spec.minimum != null && value < spec.minimum) errors.push(`${path}: below minimum`);
  if (Array.isArray(value)) {
    if (spec.minItems != null && value.length < spec.minItems) errors.push(`${path}: too few items`);
    if (spec.items) value.forEach((item, i) => validateNode(item, spec.items, `${path}[${i}]`, root, errors));
  }
  if (isObject(value)) {
    for (const key of spec.required ?? []) if (!Object.hasOwn(value, key)) errors.push(`${field(path, key)}: missing`);
    if (spec.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(spec.properties ?? {}, key)) errors.push(`${field(path, key)}: unexpected field`);
      }
    }
    for (const [key, child] of Object.entries(spec.properties ?? {})) {
      if (Object.hasOwn(value, key)) validateNode(value[key], child, field(path, key), root, errors);
    }
  }
}

export function validateManifestShape(manifest, schema = JSON.parse(readFileSync(schemaPath, 'utf8'))) {
  const errors = collectSchemaProblems(schema);
  if (!errors.length) validateNode(manifest, schema, '$', schema, errors);
  return errors;
}

/**
 * A shape-valid manifest is NOT a release certification. GO requires independently
 * verified evidence and a release-owner decision. This is a consistency gate only:
 * it cannot authenticate references or sign anything itself.
 */
export function validateManifestRelease(manifest) {
  const errors = validateManifestShape(manifest);
  if (errors.length) return errors;
  const sha = manifest.source.commit_sha;
  if (manifest.decision.classification !== 'GO') errors.push('decision: NO_GO or unset');
  if (manifest.candidate.environment === 'UNSELECTED' || !manifest.candidate.created_at_utc)
    errors.push('candidate: actual selected environment and dated identity required');
  if (!manifest.decision.release_owner || !manifest.decision.decision_ref || !manifest.decision.decided_at_utc)
    errors.push('decision: signed owner decision reference and date required');
  if (manifest.github.reviewed_head_sha !== sha || !manifest.github.tested_merge_sha)
    errors.push('github: reviewed head and independently tested merge candidate required');
  // These provider claims require independent authenticated GitHub verification.
  // File-contained identifiers alone cannot establish reviewer authenticity.
  const review = manifest.github.current_head_review;
  if (!Number.isSafeInteger(manifest.github.pr_author_user_id) ||
      manifest.github.pr_author_user_id < 1 ||
      !Number.isSafeInteger(review.review_id) || review.review_id < 1 ||
      !Number.isSafeInteger(review.reviewer_user_id) || review.reviewer_user_id < 1 ||
      review.reviewer_user_id === manifest.github.pr_author_user_id ||
      review.approved_head_sha !== sha || review.state !== 'APPROVED' ||
      review.verification !== 'VERIFIED_SUCCESS' || !review.evidence_ref)
    errors.push('github: independent authenticated current-head reviewer evidence missing or self-review');
  const seenChecks = new Set();
  for (const check of manifest.github.required_checks) {
    if (seenChecks.has(check.context)) errors.push(`github: duplicate required context ${check.context}`);
    seenChecks.add(check.context);
    if (check.conclusion !== 'VERIFIED_SUCCESS' || !check.run_id || !check.run_attempt || !check.check_run_id ||
        check.head_sha !== sha || check.tested_sha !== manifest.github.tested_merge_sha || !check.evidence_ref)
      errors.push(`github: unverified or stale required check ${check.context}`);
  }
  if (!manifest.deployments.length) errors.push('deployments: missing');
  for (const d of manifest.deployments) {
    if (d.verification !== 'VERIFIED_SUCCESS' || !d.resource_id || !d.deployment_id ||
        !d.environment || d.environment !== manifest.candidate.environment ||
        !d.region || d.deployed_git_sha !== sha || !d.evidence_ref)
      errors.push(`deployments: unverified or mismatched ${d.provider}`);
  }
  for (const a of manifest.artifacts) {
    if (a.verification !== 'VERIFIED_SUCCESS' || !a.sha256 || !a.source_ref)
      errors.push(`artifacts: unverified digest for ${a.name}`);
  }
  const db = manifest.database;
  if (db.verification !== 'VERIFIED_SUCCESS' || !db.project_id || !db.branch_id || !db.database_name ||
      !db.migration_revision || db.migration_compatibility !== 'COMPATIBLE' ||
      !db.backup_restore_evidence_ref || !db.evidence_ref)
    errors.push('database: compatibility/restore evidence unverified');
  for (const role of ['independent_code_review', 'release_owner']) {
    const approvals = manifest.approvals.filter((a) => a.role === role && a.verification === 'VERIFIED_SUCCESS' &&
      a.approved_commit_sha === sha && a.reviewer_identity && a.approval_ref);
    if (approvals.length !== 1) errors.push(`approvals: exactly one verified ${role} required`);
  }
  for (const a of manifest.approvals) {
    if (a.verification !== 'VERIFIED_SUCCESS' || a.approved_commit_sha !== sha ||
        !a.reviewer_identity || !a.approval_ref)
      errors.push(`approvals: unverified approval for ${a.role}`);
  }
  const owner = manifest.approvals.find((a) => a.role === 'release_owner')?.reviewer_identity;
  const reviewer = manifest.approvals.find((a) => a.role === 'independent_code_review')?.reviewer_identity;
  if (!owner || !reviewer || owner === reviewer) errors.push('approvals: independent reviewer must differ from release owner');
  const rb = manifest.rollback;
  if (rb.verification !== 'VERIFIED_SUCCESS' || !rb.previous_known_good_git_sha || !rb.previous_deployment_id ||
      !rb.rollback_runbook_ref || rb.schema_compatibility !== 'COMPATIBLE' || !rb.reconciliation_ref || !rb.evidence_ref)
    errors.push('rollback: previous deployment/compatibility/reconciliation evidence unverified');
  if (manifest.blockers.some((b) => b.status === 'OPEN')) errors.push('blockers: at least one OPEN release blocker');
  for (const blocker of manifest.blockers) {
    if (blocker.status !== 'OPEN' && !blocker.closure_ref)
      errors.push(`blockers: no signed closure/waiver evidence for ${blocker.id}`);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] === '--mode' ? process.argv[3] : null;
  const input = process.argv[4];
  if (!['shape', 'release'].includes(mode) || !input) {
    process.stderr.write('Usage: node validate-release-manifest.mjs --mode shape|release <file.json>\n');
    process.exitCode = 2;
  } else {
    try {
      const obj = JSON.parse(readFileSync(input, 'utf8'));
      const errors = mode === 'shape' ? validateManifestShape(obj) : validateManifestRelease(obj);
      const report = { mode, valid: errors.length === 0, errors };
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      if (errors.length) process.exitCode = 1;
    } catch (err) {
      process.stderr.write('Validation error: ' + err.message + '\n');
      process.exitCode = 2;
    }
  }
}
