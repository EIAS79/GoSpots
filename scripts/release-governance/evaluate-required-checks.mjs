#!/usr/bin/env node
/**
 * LOCAL PROOF ONLY — runs on caller-controlled synthetic JSON.
 * It NEVER authenticates GitHub identity or publishes a required check.
 * Only a separately approved protected GitHub App may fetch authoritative
 * evidence, verify its provenance and publish a required status check.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const sha40 = /^[0-9a-f]{40}$/;
const dir = dirname(fileURLToPath(import.meta.url));
const policyPath = resolve(dir, '../../docs/release-governance/required-check-policy.example.json');
const positiveId = (v) => Number.isSafeInteger(v) && v > 0;
// A proposed policy may broaden but must not silently narrow these categories.
const REQUIRED_CODEOWNER_PATTERNS = Object.freeze([
  '.github/**', 'docs/release-governance/**', 'scripts/release-governance/**',
  'apps/api/src/modules/auth/**', 'apps/api/src/modules/device-payment/**',
  'apps/api/src/modules/billing/**', 'apps/api/src/modules/checkout/**',
  'apps/api/prisma/**', 'apps/edge/**',
  'apps/api/src/modules/cash/**',
  'apps/api/src/modules/finance/**',
  'apps/api/src/modules/guest-check/**',
  'apps/api/src/common/money.util.ts',
  'apps/api/src/common/ledger-post.util.ts',
  'apps/api/src/modules/growth/phase9-**',
  'apps/api/src/modules/growth/growth-deposit-**',
  'apps/api/src/modules/growth/growth-public-deposit.service.ts',
  'apps/api/src/modules/growth/reservation-stripe-webhook-routing.interceptor.ts',
  'apps/api/src/modules/growth/reservation-growth.service.ts',
  'apps/api/src/modules/growth/phase8-reservation.service.ts',
  'apps/api/src/modules/growth/growth-pricing.service.ts',
  'apps/api/src/modules/reservations/**'
]);

const globRegex = (pattern) => {
  // Minimal glob dialect used by the exact GitHub pull_request paths:
  // ** = any path text, * = any characters excluding slash.
  let out = '^';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*' && pattern[i + 1] === '*') { out += '.*'; i++; }
    else if (char === '*') out += '[^/]*';
    else out += /[a-zA-Z0-9_/-]/.test(char) ? char : String.fromCharCode(92) + char;
  }
  return new RegExp(out + '$');
};

export const isApplicable = (job, files) =>
  job.trigger === 'always' ||
  (job.trigger === 'paths' && files.some((file) => job.paths.some((p) => globRegex(p).test(file))));

/**
 * LOCAL-ONLY review-history consistency. A later decisive state supersedes an
 * earlier decision; comments do not. Dismissal invalidates that review.
 * Timestamp order is explicit and ambiguous chronology fails closed.
 */
function effectiveReviews(reviews, errors) {
  if (!Array.isArray(reviews)) {
    errors.push('reviews: review history missing');
    return [];
  }
  const seenIds = new Set();
  const latest = new Map();
  const timestamps = new Map();
  for (const r of reviews) {
    const time = r?.submitted_at;
    if (r?.source !== 'github' || !positiveId(r?.review_id) ||
        !positiveId(r?.reviewer_user_id) || seenIds.has(r.review_id) ||
        !['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED', 'COMMENTED'].includes(r?.state) ||
        typeof time !== 'string' ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(time) ||
        !Number.isFinite(Date.parse(time)) ||
        new Date(time).toISOString() !== time ||
        !sha40.test(r?.reviewed_head_sha ?? '') ||
        !['CODEOWNER', 'GENERAL'].includes(r?.role)) {
      errors.push('reviews: invalid or duplicate synthetic review evidence');
      continue;
    }
    seenIds.add(r.review_id);
    const existingTimes = timestamps.get(r.reviewer_user_id);
    if (existingTimes?.has(time)) {
      errors.push('reviews: ambiguous same-reviewer submitted_at');
      continue;
    }
    if (!existingTimes) timestamps.set(r.reviewer_user_id, new Set([time]));
    else existingTimes.add(time);
    if (r.state === 'COMMENTED') continue;
    const existing = latest.get(r.reviewer_user_id);
    if (!existing || time > existing.submitted_at) latest.set(r.reviewer_user_id, r);
  }
  return [...latest.values()];
}
function validApproval(author, head, reviews, role = null) {
  return reviews.some((r) => r.state === 'APPROVED' &&
    r.reviewer_user_id !== author && r.reviewed_head_sha === head &&
    (role === null || r.role === role));
}
export const isSensitivePath = (file, policy) =>
  typeof file === 'string' && Array.isArray(policy?.sensitive_codeowner_paths) &&
  policy.sensitive_codeowner_paths.some((path) => globRegex(path).test(file));

/**
 * A PASS means solely "this caller-supplied snapshot satisfies local invariants".
 * provider app_id, workflow_id, checks, review identity and latest_attempt
 * are UNTRUSTED JSON here; a future publisher must derive/verify these from
 * GitHub's authenticated API and re-read them before emitting a check.
 */
export function evaluateRequiredChecks(snapshot, policy) {
  const errors = [];
  if (policy?.schema_version !== '1.0' || !Array.isArray(policy.required_jobs) || !policy.required_jobs.length)
    return ['policy: missing required-job configuration'];
  if (policy.status !== 'PROPOSAL_ONLY_NOT_ENFORCED')
    errors.push('policy: local proof must remain proposal only');
  if (snapshot?.schema_version !== '1.0' || snapshot.repository !== 'EIAS79/GoSpots')
    errors.push('snapshot: unexpected repository or version');
  if (!['pull_request', 'merge_group'].includes(snapshot?.event))
    errors.push('snapshot: unsupported event');
  // Existing CI and Phase17 YAML have no merge_group trigger. Do not treat
  // simulated merge-queue evidence as available until workflows are approved.
  if (snapshot?.event === 'merge_group' && policy.merge_group_enabled !== true)
    errors.push('merge_group: not configured in actual workflow triggers');
  const testedSha = snapshot?.event === 'merge_group' ? snapshot.merge_group_sha : snapshot?.tested_merge_sha;
  if (!sha40.test(snapshot?.head_sha ?? '') || !sha40.test(snapshot?.base_sha ?? '') ||
      !sha40.test(testedSha ?? ''))
    errors.push('snapshot: exact head/base/tested merge SHA missing');
  if (!Array.isArray(snapshot?.changed_files) || !snapshot.changed_files.length)
    errors.push('snapshot: authoritative changed paths missing');
  if (!Array.isArray(snapshot?.checks))
    errors.push('snapshot: check runs missing');
  if (errors.length) return errors;

  const files = snapshot.changed_files;
  if (files.some((s) => typeof s !== 'string' || s.startsWith('/') || s.includes('..')))
    errors.push('snapshot: invalid changed-file path');
  if (!Array.isArray(policy.sensitive_codeowner_paths) ||
      !policy.sensitive_codeowner_paths.length ||
      policy.sensitive_codeowner_paths.some((p) =>
        typeof p !== 'string' || !p || p.startsWith('/') || p.includes('..')) ||
      new Set(policy.sensitive_codeowner_paths).size !== policy.sensitive_codeowner_paths.length ||
      REQUIRED_CODEOWNER_PATTERNS.some((p) =>
        !policy.sensitive_codeowner_paths.includes(p))) {
    errors.push('policy: missing or invalid sensitive CODEOWNER path rules');
    return errors;
  }
  const sensitiveChange = files.some((f) => isSensitivePath(f, policy));
  // Claims in the local synthetic JSON are not GitHub-authenticated.
  // Future trusted publisher must obtain effective review state directly from
  // GitHub and verify reviewer authorization, dismissal, SHA and CODEOWNER role.
  const members = snapshot.event === 'merge_group'
    ? snapshot.queue_members
    : [{ head_sha: snapshot.head_sha, author_user_id: snapshot.author_user_id, reviews: snapshot.reviews }];
  if (!Array.isArray(members) || !members.length) {
    errors.push('reviews: merge queue members missing');
  } else {
    const globalReviewIds = new Set();
    for (const member of members) {
      const historyErrors = [];
      const effective = effectiveReviews(member?.reviews, historyErrors);
      errors.push(...historyErrors);
      if (member?.reviews?.some((r) => r?.reviewer_user_id === member.author_user_id))
        errors.push('reviews: PR author cannot self-review');
      for (const r of Array.isArray(member?.reviews) ? member.reviews : []) {
        if (!positiveId(r?.review_id)) continue;
        if (globalReviewIds.has(r.review_id))
          errors.push('reviews: duplicate review identity across PRs');
        globalReviewIds.add(r.review_id);
      }
      if (effective.some((r) => r.state === 'CHANGES_REQUESTED' &&
          r.reviewer_user_id !== member.author_user_id))
        errors.push('reviews: unresolved CHANGES_REQUESTED');
      if (!sha40.test(member?.head_sha ?? '') || !positiveId(member?.author_user_id) ||
          !validApproval(member.author_user_id, member.head_sha, effective))
        errors.push('reviews: independent current-head reviewer evidence missing');
      if (sensitiveChange &&
          !validApproval(member.author_user_id, member.head_sha, effective, 'CODEOWNER'))
        errors.push('reviews: current-head independent CODEOWNER approval missing');
    }
  }
  // Globally unique across all check contexts; a workflow run_id may be shared.
  const seenCheckRunIds = new Set();
  for (const c of snapshot.checks) {
    if (!positiveId(c?.check_run_id))
      errors.push('checks: invalid check_run_id identity');
    else if (seenCheckRunIds.has(c.check_run_id))
      errors.push('checks: duplicate check_run_id identity');
    else seenCheckRunIds.add(c.check_run_id);
  }

  const seenKeys = new Set(), seenContexts = new Set();
  for (const job of policy.required_jobs) {
    if (!job.key || !job.context || !positiveId(job.workflow_id) || !positiveId(job.app_id) ||
        job.app_slug !== 'github-actions' || !job.workflow_path ||
        !['always', 'paths'].includes(job.trigger) || !Array.isArray(job.paths) ||
        !job.paths.length || seenKeys.has(job.key) || seenContexts.has(job.context)) {
      errors.push('policy: missing or duplicate provider-bound job definition');
      continue;
    }
    seenKeys.add(job.key);
    seenContexts.add(job.context);
    if (!isApplicable(job, files)) continue;
    const checks = snapshot.checks.filter((c) => c.context === job.context);
    if (checks.length !== 1) {
      errors.push(`${job.key}: applicable required check missing or ambiguous (count ${checks.length})`);
      continue;
    }
    const c = checks[0];
    // Matching claimed identifiers are *local consistency assertions only*.
    // A future trusted publisher must independently authenticate each field.
    if (c.source_app_id !== job.app_id || c.source_app_slug !== job.app_slug ||
        c.workflow_id !== job.workflow_id || c.workflow_path !== job.workflow_path ||
        c.repository !== snapshot.repository || c.event !== snapshot.event ||
        !positiveId(c.run_id) || !positiveId(c.check_run_id) ||
        !positiveId(c.run_attempt) || !positiveId(c.latest_attempt) ||
        c.run_attempt !== c.latest_attempt ||
        c.status !== 'completed' || c.conclusion !== 'success' ||
        c.check_run_sha !== testedSha || c.run_head_sha !== testedSha ||
        c.tested_sha !== testedSha)
      errors.push(`${job.key}: check source, workflow, attempt, SHA or result mismatch`);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {
    process.stderr.write('Usage: node evaluate-required-checks.mjs <synthetic-snapshot.json>\n');
    process.exitCode = 2;
  } else {
    try {
      const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
      const snapshot = JSON.parse(readFileSync(process.argv[2], 'utf8'));
      const errors = evaluateRequiredChecks(snapshot, policy);
      process.stdout.write(JSON.stringify({
        verdict: errors.length ? 'FAIL_CLOSED_LOCAL_PROOF_ONLY' : 'PASS_LOCAL_PROOF_ONLY_NOT_AUTHENTICATED',
        errors
      }, null, 2) + '\n');
      if (errors.length) process.exitCode = 1;
    } catch (e) {
      process.stderr.write('Local evaluation error: ' + e.message + '\n');
      process.exitCode = 2;
    }
  }
}
