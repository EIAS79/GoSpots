import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { evaluateRequiredChecks, isApplicable, isSensitivePath } from './evaluate-required-checks.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const repo = resolve(dir, '../..');
const policy = JSON.parse(readFileSync(resolve(repo, 'docs/release-governance/required-check-policy.example.json'), 'utf8'));
const h = 'a'.repeat(40), b = 'b'.repeat(40), m = 'c'.repeat(40);
const clone = (v) => structuredClone(v);
const job = (key) => policy.required_jobs.find((j) => j.key === key);
const review = (head = h, reviewerId = 202, role = 'CODEOWNER') => ({
  source: 'github', review_id: 9876, reviewer_user_id: reviewerId,
  reviewed_head_sha: head, state: 'APPROVED', role,
  submitted_at: '2026-10-20T12:00:00.000Z'
});
function snapshot(files = ['apps/api/src/main.ts']) {
  const result = {
    schema_version: '1.0', repository: 'EIAS79/GoSpots',
    event: 'pull_request', head_sha: h, base_sha: b, tested_merge_sha: m,
    author_user_id: 101, reviews: [review()], changed_files: files, checks: []
  };
  result.checks = policy.required_jobs.filter((j) => isApplicable(j, files)).map((j, index) => ({
    context: j.context, source_app_id: j.app_id, source_app_slug: j.app_slug,
    workflow_id: j.workflow_id, workflow_path: j.workflow_path,
    repository: result.repository, event: result.event,
    run_id: 11, run_attempt: 2, latest_attempt: 2, check_run_id: 66 + index,
    status: 'completed', conclusion: 'success',
    check_run_sha: m, run_head_sha: m, tested_sha: m
  }));
  return result;
}

test('actual GitHub exact check names, immutable IDs and workflow sources cannot drift', () => {
  const sourceSha = 'e79a87b39a974bf98d746716895e255e1f6f202e';
  assert.equal(policy.observed_against_sha, sourceSha);
  const expected = [
    ['ci','API changed-lint · test · build',317852730,'.github/workflows/ci.yml'],
    ['edge','Edge Hub test · build',317852730,'.github/workflows/ci.yml'],
    ['release-integrity','Phase 17 gate · security · migrations · reconciliation · DR',338007141,'.github/workflows/phase17-validation.yml'],
    ['browser','Phase 17 gate · full permanent browser release suite',338007141,'.github/workflows/phase17-validation.yml'],
    ['release-contract','Phase 17 gate · release policy completeness',338007141,'.github/workflows/phase17-validation.yml']
  ];
  assert.equal(policy.required_jobs.length, expected.length);
  for (const [key, context, workflowId, workflowPath] of expected) {
    assert.deepEqual({
      context:job(key).context, workflow_id:job(key).workflow_id,
      workflow_path:job(key).workflow_path, app_id:job(key).app_id,
      app_slug:job(key).app_slug
    }, {context, workflow_id:workflowId, workflow_path:workflowPath,
      app_id:15368, app_slug:'github-actions'});
  }
  assert.equal(policy.stable_context, 'Release Governance / required-evidence');
  assert.equal(policy.expected_check_source, 'OWNER_APPROVED_GITHUB_APP_ID_PENDING');
});
test('provider check names match actual CI and Phase17 YAML job display names', () => {
  const ci = readFileSync(resolve(repo,'.github/workflows/ci.yml'),'utf8');
  const p17 = readFileSync(resolve(repo,'.github/workflows/phase17-validation.yml'),'utf8');
  assert.equal(ci.match(/^  api:\n    name: (.*)$/m)?.[1],job('ci').context);
  assert.equal(ci.match(/^  edge:\n    name: (.*)$/m)?.[1],job('edge').context);
  assert.equal(p17.match(/^  release-integrity:\n    name: (.*)$/m)?.[1],job('release-integrity').context);
  assert.equal(p17.match(/^  pilot-e2e:\n    name: (.*)$/m)?.[1],job('browser').context);
  assert.equal(p17.match(/^  release-contract:\n    name: (.*)$/m)?.[1],job('release-contract').context);
});
test('Phase17 applicable paths match ACTUAL pull_request paths without broadening', () => {
  const content=readFileSync(resolve(repo,'.github/workflows/phase17-validation.yml'),'utf8');
  const section=content.split('  pull_request:\n')[1]?.split('  push:\n')[0];
  assert.ok(section,'Phase17 pull_request filter missing');
  const actual=[...section.matchAll(/^      - '([^']+)'$/gm)].map((x)=>x[1]);
  assert.equal(actual.length,8);
  assert.deepEqual(job('release-integrity').paths,actual);
  assert.deepEqual(job('browser').paths,actual);
  assert.deepEqual(job('release-contract').paths,actual);
  assert.deepEqual(job('ci').paths,['**']);
  assert.deepEqual(job('edge').paths,['**']);
  assert.equal(job('ci').trigger,'always');
  assert.equal(job('edge').trigger,'always');
  assert.equal(job('release-integrity').trigger,'paths');
  assert.equal(job('browser').trigger,'paths');
  assert.equal(job('release-contract').trigger,'paths');
});
test('Phase17 skips ordinary web, common API and CI workflow edits; CI still required', () => {
  for (const file of ['apps/web/src/app/page.tsx','apps/api/src/common/permissions.ts','.github/workflows/ci.yml']) {
    const applicable=policy.required_jobs.filter((j)=>isApplicable(j,[file])).map((j)=>j.key);
    assert.deepEqual(applicable,['ci','edge'],file);
  }
  for (const file of ['apps/web/e2e/kds.spec.ts','apps/edge/src/printer.js',
    'apps/api/src/modules/hardware/hardware.service.ts','apps/api/prisma/schema.prisma',
    'docs/acceptance/phase-17-pilot.md','.github/workflows/phase17-validation.yml']) {
    const applicable=policy.required_jobs.filter((j)=>isApplicable(j,[file])).map((j)=>j.key);
    assert.deepEqual(applicable,['ci','edge','release-integrity','browser','release-contract'],file);
  }
});
test('successful snapshot passes only synthetic local consistency', () => {
  assert.deepEqual(evaluateRequiredChecks(snapshot(),policy),[]);
});
test('missing always-running Edge check always fails, even docs-only', () => {
  const s=snapshot(['docs/README.md']);
  s.checks=s.checks.filter((c)=>c.context!==job('edge').context);
  assert.match(evaluateRequiredChecks(s,policy).join('\n'),/edge: applicable required check missing/);
});
test('missing applicable Phase17 job fails; inapplicable Phase17 job is not required', () => {
  const s=snapshot(['apps/edge/src/printer.js']);
  s.checks=s.checks.filter((c)=>c.context!==job('release-integrity').context);
  assert.match(evaluateRequiredChecks(s,policy).join('\n'),/release-integrity: applicable required check missing/);
  assert.deepEqual(evaluateRequiredChecks(snapshot(['docs/README.md']),policy),[]);
});
test('missing CI and duplicate check names fail closed', () => {
  const s=snapshot();
  s.checks=s.checks.filter((c)=>c.context!==job('ci').context);
  assert.match(evaluateRequiredChecks(s,policy).join('\n'),/ci: applicable required check missing/);
  const d=snapshot(); d.checks.push(clone(d.checks[0]));
  assert.match(evaluateRequiredChecks(d,policy).join('\n'),/ambiguous/);
});
test('check source app ID, workflow ID and workflow path must match provider identifiers', () => {
  for (const key of ['source_app_id','workflow_id','workflow_path','source_app_slug']) {
    const s=snapshot();
    s.checks[0][key]='bad-value';
    assert.match(evaluateRequiredChecks(s,policy).join('\n'),/source, workflow, attempt/,key);
  }
});
test('a changed provider context name cannot satisfy policy', () => {
  const s=snapshot();
  s.checks[0].context='API changed-lint, full Jest and build';
  assert.match(evaluateRequiredChecks(s,policy).join('\n'),/ci: applicable required check missing/);
});
test('stale rerun or SHA mismatches fail closed', () => {
  for (const [key,value] of [['run_attempt',1],['check_run_sha',h],['run_head_sha',h],
    ['tested_sha',h],['status','in_progress'],['conclusion','failure']]) {
    const s=snapshot(); s.checks[0][key]=value;
    assert.match(evaluateRequiredChecks(s,policy).join('\n'),/source, workflow, attempt/,key);
  }
});
test('all PRs require an independent authenticated current-head review snapshot', () => {
  for (const invalid of [
    {reviews:[]},
    {author_user_id:202},
    {reviews:[review(b)]},
    {reviews:[{...review(),review_id:null}]},
    {reviews:[{...review(),source:'user-supplied'}]},
    {reviews:[{...review(),state:'DISMISSED'}]}
  ]) {
    const s=snapshot(); Object.assign(s,invalid);
    assert.match(evaluateRequiredChecks(s,policy).join('\n'),/independent current-head reviewer/,JSON.stringify(invalid));
  }
});
test('changes to workflows, CODEOWNERS or governance policies require CODEOWNER approval', () => {
  for (const f of ['.github/workflows/ci.yml','.github/CODEOWNERS',
    'docs/release-governance/required-check-policy.example.json',
    'scripts/release-governance/evaluate-required-checks.mjs']) {
    const s=snapshot([f]); s.reviews=[review(h,202,'GENERAL')];
    assert.match(evaluateRequiredChecks(s,policy).join('\n'),/CODEOWNER approval/,f);
    s.reviews=[review(h,202,'CODEOWNER')];
    assert.deepEqual(evaluateRequiredChecks(s,policy),[],f);
  }
});
test('merge queue requires every constituent PR independently approved and exact group SHA checks', () => {
  const s=snapshot(['apps/api/src/main.ts']);
  s.event='merge_group';
  s.merge_group_sha='d'.repeat(40);
  s.queue_members=[
    {head_sha:h,author_user_id:101,reviews:[review(h,202)]},
    {head_sha:'e'.repeat(40),author_user_id:303,reviews:[{...review('e'.repeat(40),404),review_id:9877}]}
  ];
  s.checks=s.checks.map((c)=>({...c,event:'merge_group',
    check_run_sha:s.merge_group_sha,run_head_sha:s.merge_group_sha,tested_sha:s.merge_group_sha}));
  // Existing source workflows have no merge_group trigger; block by default.
  assert.match(evaluateRequiredChecks(s,policy).join('\n'),/merge_group: not configured/);
  // Synthetic policy represents a separately authorized future trigger change.
  const enabled=clone(policy); enabled.merge_group_enabled=true;
  assert.deepEqual(evaluateRequiredChecks(s,enabled),[]);
  s.queue_members[1].reviews=[];
  assert.match(evaluateRequiredChecks(s,enabled).join('\n'),/independent current-head reviewer/);
});
test('fail closed on missing queue membership or invalid snapshot SHA', () => {
  const s=snapshot();s.event='merge_group';s.merge_group_sha='d'.repeat(40);
  const enabled=clone(policy); enabled.merge_group_enabled=true;
  assert.match(evaluateRequiredChecks(s,enabled).join('\n'),/queue members missing/);
  s.event='pull_request'; s.head_sha=null;
  assert.match(evaluateRequiredChecks(s,policy).join('\n'),/exact head\/base/);
});
test('policy with an unexpected duplicate definition fails closed', () => {
  const p=clone(policy);p.required_jobs.push(clone(p.required_jobs[0]));
  assert.match(evaluateRequiredChecks(snapshot(),p).join('\n'),/duplicate provider-bound/);
});

test('the policy does not falsely claim merge-queue trigger support', () => {
  assert.equal(policy.merge_group_enabled,false);
  for (const f of ['.github/workflows/ci.yml','.github/workflows/phase17-validation.yml']) {
    const source=readFileSync(resolve(repo,f),'utf8');
    assert.doesNotMatch(source,/^  merge_group:/m);
  }
});

test('all three Phase 17 job contexts are represented and mandatory when triggered', () => {
  const workflow=readFileSync(resolve(repo,'.github/workflows/phase17-validation.yml'),'utf8');
  const declared=[...workflow.matchAll(/^  (release-integrity|pilot-e2e|release-contract):\n    name: (.*)$/gm)];
  assert.equal(declared.length,3);
  const expectedContexts=declared.map((m)=>m[2]).sort();
  const policyContexts=policy.required_jobs.filter((j)=>j.workflow_id===338007141).map((j)=>j.context).sort();
  assert.deepEqual(policyContexts,expectedContexts);
  const changed=['apps/api/prisma/schema.prisma'];
  const s=snapshot(changed);
  assert.equal(s.checks.filter((c)=>policyContexts.includes(c.context)).length,3);
  for (const context of policyContexts) {
    const missing=clone(s);
    missing.checks=missing.checks.filter((c)=>c.context!==context);
    assert.match(evaluateRequiredChecks(missing,policy).join('\n'),/applicable required check missing/,context);
  }
});
test('governance file changes do not falsely require Phase 17 until its paths are widened', () => {
  for (const path of [
    'docs/release-governance/release-manifest.schema.json',
    'scripts/release-governance/evaluate-required-checks.test.mjs'
  ]) {
    assert.deepEqual(policy.required_jobs.filter((j)=>isApplicable(j,[path])).map((j)=>j.key),['ci','edge']);
    const s=snapshot([path]);
    assert.deepEqual(evaluateRequiredChecks(s,policy),[]);
    assert.match(evaluateRequiredChecks({...s,reviews:[]},policy).join('\n'),/independent current-head reviewer/);
  }
});

test('financial integrity and live-floor validations have unfiltered PR triggers for future release policy', () => {
  for (const [file, jobName] of [
    ['.github/workflows/phase4-validation.yml','Commercial core · settlement · ledger gate'],
    ['.github/workflows/phase3-validation.yml','Live floor · migration · busy-shift gate']
  ]) {
    const source=readFileSync(resolve(repo,file),'utf8');
    assert.match(source,/^  pull_request:\s*$/m);
    assert.doesNotMatch(source,/^  pull_request:\n    paths:/m);
    assert.ok(source.includes('name: '+jobName),jobName);
  }
  assert.equal(policy.required_jobs.some((j)=>j.context==='Commercial core · settlement · ledger gate'),false,
    'Do not claim future comprehensive financial policy is active');
});


// V5 supervisor regressions: these fixtures remain untrusted synthetic data.
const later = (r, state, id, time, head = h) => ({
  ...r, review_id:id, state, submitted_at:time, reviewed_head_sha:head
});
const t13 = '2026-10-20T13:00:00.000Z';
const t14 = '2026-10-20T14:00:00.000Z';
test('V5 distinct required contexts cannot reuse a GitHub check_run_id', () => {
  const s = snapshot();
  assert.ok(s.checks.length >= 2);
  assert.deepEqual(evaluateRequiredChecks(s,policy),[]);
  s.checks[1].check_run_id=s.checks[0].check_run_id;
  assert.match(evaluateRequiredChecks(s,policy).join('\\n'),/duplicate check_run_id/);
  s.checks[1].check_run_id=0;
  assert.match(evaluateRequiredChecks(s,policy).join('\\n'),/invalid check_run_id/);
});
test('V5 duplicate check_run_id on extra context also fails closed', () => {
  const s=snapshot();
  s.checks.push({...s.checks[0],context:'unrequired-extra-context'});
  assert.match(evaluateRequiredChecks(s,policy).join('\\n'),/duplicate check_run_id/);
});
test('V5 later CHANGES_REQUESTED overrides an earlier approval regardless of array order', () => {
  for (const reverse of [false,true]) {
    const s=snapshot();
    const accepted=review();
    const rejected=later(accepted,'CHANGES_REQUESTED',9877,t13);
    s.reviews=reverse?[rejected,accepted]:[accepted,rejected];
    assert.match(evaluateRequiredChecks(s,policy).join('\\n'),/unresolved CHANGES_REQUESTED/);
  }
});
test('V5 later approval resolves changes only when approval is on current head', () => {
  const s=snapshot();
  const rejected=later(review(),'CHANGES_REQUESTED',9878,t13);
  const accepted=later(review(),'APPROVED',9879,t14);
  s.reviews=[accepted,rejected];
  assert.deepEqual(evaluateRequiredChecks(s,policy),[]);
  s.reviews=[{...accepted,reviewed_head_sha:b},rejected];
  assert.match(evaluateRequiredChecks(s,policy).join('\\n'),/independent current-head reviewer/);
});
test('V5 latest dismissed approval cannot reuse older approval', () => {
  const s=snapshot();
  s.reviews=[review(),later(review(),'DISMISSED',9877,t13)];
  assert.match(evaluateRequiredChecks(s,policy).join('\\n'),/independent current-head reviewer/);
  s.reviews=[later(review(),'CHANGES_REQUESTED',9877,t13),
    later(review(),'DISMISSED',9878,t14),{...review(),reviewer_user_id:303,review_id:9879}];
  assert.deepEqual(evaluateRequiredChecks(s,policy),[]);
});
test('V5 another reviewer unresolved CHANGES_REQUESTED blocks despite approval', () => {
  const s=snapshot();
  s.reviews=[review(),{...later(review(),'CHANGES_REQUESTED',9877,t13),reviewer_user_id:303}];
  assert.match(evaluateRequiredChecks(s,policy).join('\\n'),/unresolved CHANGES_REQUESTED/);
});
test('V5 later COMMENTED does not supersede current-head approval', () => {
  const s=snapshot();
  s.reviews=[review(),later(review(),'COMMENTED',9877,t13)];
  assert.deepEqual(evaluateRequiredChecks(s,policy),[]);
});
test('V5 repeated review IDs, tied chronology and forged timestamps fail closed', () => {
  for (const records of [
    [review(),{...review(),reviewer_user_id:303}],
    [review(),later(review(),'CHANGES_REQUESTED',9877,'2026-10-20T12:00:00.000Z')],
    [review(),later(review(),'APPROVED',9877,'invalid')],
    [review(),{...later(review(),'APPROVED',9877,t13),source:'user-asserted'}]
  ]) {
    const s=snapshot();s.reviews=records;
    assert.match(evaluateRequiredChecks(s,policy).join('\\n'),/reviews: (invalid|ambiguous)/);
  }
});
test('V5 sensitive paths cover GitHub actions, payments, auth, Prisma, Edge', () => {
  for (const f of [
    '.github/actions/release/action.yml','.github/workflows/ci.yml','.github/CODEOWNERS',
    'docs/release-governance/required-check-policy.example.json',
    'scripts/release-governance/evaluate-required-checks.mjs',
    'apps/api/src/modules/device-payment/device-payment.service.ts',
    'apps/api/src/modules/billing/billing.service.ts',
    'apps/api/src/modules/checkout/checkout.service.ts',
    'apps/api/src/modules/auth/auth.service.ts','apps/api/prisma/schema.prisma',
    'apps/api/src/prisma/prisma.service.ts','apps/edge/src/index.ts',
    'apps/web/src/app/(auth)/login/page.tsx',
    'apps/web/src/components/auth/signin.tsx','apps/web/src/modules/auth/auth.ts'
  ]) {
    assert.equal(isSensitivePath(f,policy),true,f);
    const s=snapshot([f]);s.reviews=[review(h,202,'GENERAL')];
    assert.match(evaluateRequiredChecks(s,policy).join('\\n'),/CODEOWNER approval/,f);
    s.reviews=[review()];
    assert.deepEqual(evaluateRequiredChecks(s,policy),[],f);
  }
});
test('V5 unrelated paths do not invent CODEOWNER enforcement', () => {
  for (const f of ['apps/web/src/app/page.tsx','docs/README.md','apps/api/src/common/health.ts']) {
    assert.equal(isSensitivePath(f,policy),false,f);
    const s=snapshot([f]);s.reviews=[review(h,202,'GENERAL')];
    assert.deepEqual(evaluateRequiredChecks(s,policy),[],f);
  }
});
test('V5 missing sensitive-path policy fails closed', () => {
  const p=clone(policy);delete p.sensitive_codeowner_paths;
  assert.match(evaluateRequiredChecks(snapshot(),p).join('\\n'),/sensitive CODEOWNER path rules/);
});
test('V5 stale latest CODEOWNER approval fails despite older valid approval', () => {
  const s=snapshot(['.github/actions/security/action.yml']);
  s.reviews=[review(),later(review(),'APPROVED',9877,t13,b)];
  assert.match(evaluateRequiredChecks(s,policy).join('\\n'),/CODEOWNER approval/);
});
test('V5 duplicate review ID across merge queue members is contradictory', () => {
  const s=snapshot();
  s.event='merge_group';s.merge_group_sha='d'.repeat(40);
  s.queue_members=[
    {head_sha:h,author_user_id:101,reviews:[review()]},
    {head_sha:'e'.repeat(40),author_user_id:303,
     reviews:[review('e'.repeat(40),404)]}
  ];
  s.checks=s.checks.map((c)=>({...c,event:'merge_group',
    check_run_sha:s.merge_group_sha,run_head_sha:s.merge_group_sha,tested_sha:s.merge_group_sha}));
  const p=clone(policy);p.merge_group_enabled=true;
  assert.match(evaluateRequiredChecks(s,p).join('\\n'),/duplicate review identity/);
});


test('V5 mandatory sensitive-path categories cannot be removed from policy', () => {
  for (const path of [
    '.github/**', 'docs/release-governance/**', 'scripts/release-governance/**',
    'apps/api/src/modules/auth/**', 'apps/api/src/modules/device-payment/**',
    'apps/api/src/modules/billing/**', 'apps/api/src/modules/checkout/**',
    'apps/api/prisma/**', 'apps/edge/**'
  ]) {
    const p=clone(policy);
    p.sensitive_codeowner_paths=p.sensitive_codeowner_paths.filter((x)=>x!==path);
    assert.match(evaluateRequiredChecks(snapshot(),p).join('\\n'),/sensitive CODEOWNER path rules/,path);
  }
});

test('V5 PR author cannot forge a review identity, even when another reviewer approves', () => {
  const s=snapshot();
  s.reviews.push({...review(),review_id:99031,reviewer_user_id:s.author_user_id,
    state:'CHANGES_REQUESTED',submitted_at:'2026-10-20T14:00:00.000Z'});
  assert.match(evaluateRequiredChecks(s,policy).join('\\n'),/author cannot self-review/);
});


const v6FinancialFixtures = [
  ['apps/api/src/modules/cash/cash.service.ts', 'cash handling and shifts'],
  ['apps/api/src/modules/finance/finance-transaction.service.ts', 'financial transactions'],
  ['apps/api/src/modules/guest-check/guest-check.service.ts', 'commercial guest checks'],
  ['apps/api/src/common/money.util.ts', 'canonical money calculations'],
  ['apps/api/src/common/ledger-post.util.ts', 'ledger postings'],
  ['apps/api/src/modules/growth/phase9-customer-value.service.ts', 'stored value'],
  ['apps/api/src/modules/growth/growth-deposit-reconciliation.service.ts', 'deposit reconciliation'],
  ['apps/api/src/modules/growth/growth-public-deposit.service.ts', 'deposit payment'],
  ['apps/api/src/modules/growth/reservation-stripe-webhook-routing.interceptor.ts', 'webhook routing'],
  ['apps/api/src/modules/growth/reservation-growth.service.ts', 'reservation deposit operations'],
  ['apps/api/src/modules/growth/phase8-reservation.service.ts', 'reservation payments'],
  ['apps/api/src/modules/growth/growth-pricing.service.ts', 'pricing'],
  ['apps/api/src/modules/reservations/reservations-staff.service.ts', 'reservation finance']
];
const v6RequiredPatterns = [
  "apps/api/src/modules/cash/**",
  "apps/api/src/modules/finance/**",
  "apps/api/src/modules/guest-check/**",
  "apps/api/src/common/money.util.ts",
  "apps/api/src/common/ledger-post.util.ts",
  "apps/api/src/modules/growth/phase9-**",
  "apps/api/src/modules/growth/growth-deposit-**",
  "apps/api/src/modules/growth/growth-public-deposit.service.ts",
  "apps/api/src/modules/growth/reservation-stripe-webhook-routing.interceptor.ts",
  "apps/api/src/modules/growth/reservation-growth.service.ts",
  "apps/api/src/modules/growth/phase8-reservation.service.ts",
  "apps/api/src/modules/growth/growth-pricing.service.ts",
  "apps/api/src/modules/reservations/**"
];

test('V6 audited financial authority files exist and match sensitive path rules', () => {
  for (const [file, purpose] of v6FinancialFixtures) {
    assert.equal(existsSync(resolve(repo,file)),true,purpose + ': ' + file);
    assert.equal(isSensitivePath(file,policy),true,purpose + ': ' + file);
  }
});

test('V6 general review cannot authorize money changes, current-head CODEOWNER can', () => {
  for (const [file, purpose] of v6FinancialFixtures) {
    const s=snapshot([file]);
    s.reviews=[review(h,202,'GENERAL')];
    assert.match(evaluateRequiredChecks(s,policy).join('\\n'),/CODEOWNER approval/,purpose);
    s.reviews=[review(h,202,'CODEOWNER')];
    assert.deepEqual(evaluateRequiredChecks(s,policy),[],purpose);
  }
});

test('V6 removing any mandatory financial-sensitive pattern fails closed', () => {
  for (const pattern of v6RequiredPatterns) {
    const p=clone(policy);
    assert.ok(p.sensitive_codeowner_paths.includes(pattern),pattern);
    p.sensitive_codeowner_paths=p.sensitive_codeowner_paths.filter((x)=>x!==pattern);
    assert.match(evaluateRequiredChecks(snapshot(),p).join('\\n'),
      /sensitive CODEOWNER path rules/,pattern);
  }
});

test('V6 cash, finance, guest-check, stored-value and deposit paths reject stale or superseded approvals', () => {
  for (const file of [
    'apps/api/src/modules/cash/cash.service.ts',
    'apps/api/src/modules/finance/finance-transaction.service.ts',
    'apps/api/src/modules/guest-check/guest-check.service.ts',
    'apps/api/src/modules/growth/phase9-customer-value.service.ts',
    'apps/api/src/modules/growth/growth-deposit-reconciliation.service.ts'
  ]) {
    const s=snapshot([file]);
    s.reviews=[review(b,202,'CODEOWNER')];
    assert.match(evaluateRequiredChecks(s,policy).join('\\n'),/CODEOWNER approval/,file);
    s.reviews=[review(h,202,'CODEOWNER'),
      later(review(),'CHANGES_REQUESTED',99091,'2026-10-20T14:00:00.000Z')];
    assert.match(evaluateRequiredChecks(s,policy).join('\\n'),/unresolved CHANGES_REQUESTED/,file);
  }
});

test('V6 unrelated routes remain outside financial CODEOWNER classification', () => {
  for (const file of ['apps/api/src/modules/notes/notes.service.ts',
    'apps/api/src/modules/gallery/gallery.service.ts','apps/web/src/app/page.tsx']) {
    assert.equal(isSensitivePath(file,policy),false,file);
  }
});
