import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateManifestShape, validateManifestRelease } from './validate-release-manifest.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const examplePath = resolve(dir, '../../docs/release-governance/release-manifest.example.json');
const example = () => JSON.parse(readFileSync(examplePath, 'utf8'));
const fakeSha = 'a'.repeat(40);
const clone = (o) => structuredClone(o);

function syntheticComplete() {
  const m = example();
  m.candidate.created_at_utc = '2026-10-19T00:00:00Z';
  m.candidate.environment = 'synthetic-only';
  m.github.pr_author_user_id = 1001;
  m.github.current_head_review = {
    review_id: 4001, reviewer_user_id: 2002,
    approved_head_sha: m.source.commit_sha, state: 'APPROVED',
    evidence_ref: 'synthetic://authenticated-github-review',
    verification: 'VERIFIED_SUCCESS'
  };
  m.github.reviewed_head_sha = m.source.commit_sha;
  m.github.tested_merge_sha = fakeSha;
  for (const check of m.github.required_checks) {
    Object.assign(check, {
      run_id: 123, run_attempt: 1, check_run_id: 456,
      head_sha: m.source.commit_sha, tested_sha: fakeSha,
      conclusion: 'VERIFIED_SUCCESS', evidence_ref: 'synthetic://check'
    });
  }
  for (const d of m.deployments) {
    Object.assign(d, {
      resource_id: 'synthetic-resource', deployment_id: 'synthetic-deploy',
      environment: 'synthetic-only', region: 'synthetic-region',
      deployed_git_sha: m.source.commit_sha, evidence_ref: 'synthetic://deploy',
      verification: 'VERIFIED_SUCCESS'
    });
  }
  Object.assign(m.database, {
    project_id: 'synthetic', branch_id: 'synthetic', database_name: 'synthetic',
    migration_revision: 'synthetic', migration_compatibility: 'COMPATIBLE',
    backup_restore_evidence_ref: 'synthetic://backup', evidence_ref: 'synthetic://db',
    verification: 'VERIFIED_SUCCESS'
  });
  const users = ['synthetic-reviewer', 'synthetic-owner'];
  m.approvals.forEach((a, i) => Object.assign(a, {
    reviewer_identity: users[i], approved_commit_sha: m.source.commit_sha,
    approval_ref: 'synthetic://approval', verification: 'VERIFIED_SUCCESS'
  }));
  Object.assign(m.rollback, {
    previous_known_good_git_sha: 'b'.repeat(40),
    previous_deployment_id: 'synthetic-previous', rollback_runbook_ref: 'synthetic://runbook',
    schema_compatibility: 'COMPATIBLE', reconciliation_ref: 'synthetic://reconcile',
    evidence_ref: 'synthetic://rollback', verification: 'VERIFIED_SUCCESS'
  });
  m.blockers.forEach((b) => { b.status = 'RESOLVED'; b.closure_ref = 'synthetic://blocker-closure'; });
  Object.assign(m.decision, {
    classification: 'GO', decision_ref: 'synthetic://decision',
    release_owner: 'synthetic-owner', decided_at_utc: '2026-10-19T00:00:00Z'
  });
  return m;
}

test('example is shape-valid and explicitly fails release', () => {
  assert.deepEqual(validateManifestShape(example()), []);
  assert.ok(validateManifestRelease(example()).length > 5);
});
test('rejects wrong SHA and unexpected fields', () => {
  const m = example();
  m.source.tree_sha = 'NOT_A_SHA';
  m.source.extra = 'unapproved';
  const errors = validateManifestShape(m).join('\n');
  assert.match(errors, /tree_sha/);
  assert.match(errors, /extra/);
});
test('rejects missing fields and invalid statuses', () => {
  const m = example();
  delete m.database.migration_compatibility;
  m.decision.classification = 'MAYBE';
  assert.match(validateManifestShape(m).join('\n'), /migration_compatibility/);
  assert.match(validateManifestShape(m).join('\n'), /classification/);
});
test('rejects invalid digest and run ID shape', () => {
  const m = example();
  m.artifacts.push({ name: 'synthetic', sha256: 'xyz', source_ref: null, verification: 'UNVERIFIED' });
  m.github.required_checks[0].run_id = -1;
  const errors = validateManifestShape(m).join('\n');
  assert.match(errors, /sha256/);
  assert.match(errors, /run_id/);
});
test('rejects wrong timestamp format', () => {
  const m = example();
  m.decision.decided_at_utc = '2026-10-19T11:00:00+02:00';
  assert.match(validateManifestShape(m).join('\n'), /decided_at_utc/);
});
test('synthetic complete fixture passes deterministic consistency checks only', () => {
  const m = syntheticComplete();
  assert.deepEqual(validateManifestShape(m), []);
  assert.deepEqual(validateManifestRelease(m), []);
});
test('open blocker or unverified deployment fails closed', () => {
  const m = syntheticComplete();
  m.blockers[0].status = 'OPEN';
  m.deployments[0].verification = 'UNVERIFIED';
  const problems = validateManifestRelease(m).join('\n');
  assert.match(problems, /blockers/);
  assert.match(problems, /deployments/);
});
test('mismatched source or tested merge SHA fails closed', () => {
  const m = syntheticComplete();
  m.github.required_checks[0].head_sha = 'c'.repeat(40);
  m.github.required_checks[0].tested_sha = 'd'.repeat(40);
  assert.match(validateManifestRelease(m).join('\n'), /stale required check/);
});
test('self-review fails and lacks independent approval', () => {
  const m = syntheticComplete();
  m.approvals[0].reviewer_identity = m.approvals[1].reviewer_identity;
  assert.match(validateManifestRelease(m).join('\n'), /independent reviewer/);
});
test('run IDs and artifact integrity required', () => {
  const m = syntheticComplete();
  m.github.required_checks[0].run_attempt = null;
  m.artifacts.push({ name: 'synthetic', sha256: null, source_ref: null, verification: 'UNVERIFIED' });
  const err = validateManifestRelease(m).join('\n');
  assert.match(err, /required check/);
  assert.match(err, /artifact/);
});
test('CLI returns 0 for example shape and 1 for unverified release', () => {
  const bin = resolve(dir, 'validate-release-manifest.mjs');
  const shape = spawnSync(process.execPath, [bin, '--mode', 'shape', examplePath], { encoding: 'utf8' });
  const release = spawnSync(process.execPath, [bin, '--mode', 'release', examplePath], { encoding: 'utf8' });
  assert.equal(shape.status, 0);
  assert.equal(release.status, 1);
  assert.match(release.stdout, /NO_GO/);
});

test('a resolved blocker without closure/waiver evidence is not a GO', () => {
  const m = syntheticComplete();
  m.blockers[0].closure_ref = null;
  assert.match(validateManifestRelease(m).join('\n'), /closure\/waiver/);
});
test('a deployment from the wrong environment is rejected even with a matching SHA', () => {
  const m = syntheticComplete();
  m.deployments[0].environment = 'different-synthetic-environment';
  assert.match(validateManifestRelease(m).join('\n'), /mismatched vercel/);
});
test('unverified optional security approval cannot be hidden behind two verified roles', () => {
  const m = syntheticComplete();
  m.approvals.push({
    role:'security', reviewer_identity:null, approved_commit_sha:null,
    approval_ref:null, verification:'UNVERIFIED'
  });
  assert.match(validateManifestRelease(m).join('\n'), /unverified approval for security/);
});

test('current-head independent GitHub reviewer is mandatory in release mode', () => {
  const m = syntheticComplete();
  m.github.current_head_review.reviewer_user_id = m.github.pr_author_user_id;
  assert.match(validateManifestRelease(m).join('\n'), /self-review/);
  m.github.current_head_review.reviewer_user_id = 2002;
  m.github.current_head_review.approved_head_sha = 'f'.repeat(40);
  assert.match(validateManifestRelease(m).join('\n'), /current-head reviewer/);
  m.github.current_head_review.approved_head_sha = m.source.commit_sha;
  m.github.current_head_review.review_id = null;
  assert.match(validateManifestRelease(m).join('\n'), /current-head reviewer/);
  m.github.current_head_review.review_id = 4001;
  m.github.current_head_review.verification = 'UNVERIFIED';
  assert.match(validateManifestRelease(m).join('\n'), /current-head reviewer/);
});
