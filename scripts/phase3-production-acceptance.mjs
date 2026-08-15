import { writeFile } from 'node:fs/promises';

const base = (process.env.GOSPOTS_BASE_URL || 'https://www.gospots.eu/api/v1').replace(/\/$/, '');
const venue = process.env.GOSPOTS_ACCEPTANCE_VENUE || 'acceptance-c6c8541bec76';
let token = process.env.PHASE3_ACCESS_TOKEN;
const runId = process.env.GITHUB_RUN_ID || String(Date.now());
const marker = `P3-PROD-${runId}`;
const evidence = { marker, base, venue, startedAt: new Date().toISOString(), checks: [], ids: {} };

function ok(name, detail = {}) {
  evidence.checks.push({ name, status: 'PASS', ...detail });
  console.log(`PASS ${name}`);
}
function fail(name, detail = {}) {
  evidence.checks.push({ name, status: 'FAIL', ...detail });
  throw new Error(`${name}: ${JSON.stringify(detail)}`);
}
function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}
async function request(method, path, body, auth = token, expected) {
  const headers = { accept: 'application/json' };
  if (auth) headers.authorization = `Bearer ${auth}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await res.text();
  const payload = parseJson(text);
  if (expected && !expected.includes(res.status)) {
    throw Object.assign(new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 800)}`), { status: res.status, payload });
  }
  return { status: res.status, body: payload, headers: res.headers };
}
async function must(method, path, body, auth = token) {
  const result = await request(method, path, body, auth);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${method} ${path} -> ${result.status}: ${JSON.stringify(result.body).slice(0, 800)}`);
  }
  return result;
}
function cookie(headers, name) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie') || ''];
  for (const value of values) {
    const m = value.match(new RegExp(`(?:^|[,;]\\s*)${name}=([^;]+)`));
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}
function idOf(x) { return x?.id || x?.session?.id || x?.data?.id; }
function versionOf(x) { return x?.version ?? x?.session?.version ?? x?.data?.version; }
function floorRows(body) { return Array.isArray(body) ? body : body?.resources || body?.floor || []; }

async function main() {
  const ready = await must('GET', '/ready', undefined, null);
  if (ready.body?.status !== 'ready') fail('production readiness', { body: ready.body });
  ok('production readiness', { body: ready.body });

  if (!token) fail('bootstrap access token missing');
  const bound = await must('POST', `/auth/venue/${encodeURIComponent(venue)}/session`, undefined, token);
  const boundToken = cookie(bound.headers, 'access_token');
  if (!boundToken) fail('venue-scoped token bind', { response: bound.body });
  token = boundToken;
  ok('venue-scoped authentication');

  const uniqueName = `${marker} Billiards`;
  const category = (await must('POST', '/resources/categories', {
    type: 'BILLIARD', name: uniqueName, description: 'Isolated Phase 3 production acceptance floor',
    slotMinutes: 60, unitCount: 4, unitNamePrefix: `${marker}-T`, rates: [{ label: 'Hourly', price: 60 }]
  })).body;
  evidence.ids.categoryId = category.id;
  const catalog = (await must('GET', '/resources/catalog')).body;
  const cat = catalog.categories.find((c) => c.id === category.id);
  if (!cat || cat.resources.length < 4) fail('acceptance floor provisioning', { category });
  const [r1, r2, r3, r4] = cat.resources;
  Object.assign(evidence.ids, { r1: r1.id, r2: r2.id, r3: r3.id, r4: r4.id });
  ok('acceptance floor provisioning', { resources: cat.resources.map((r) => r.id) });

  const policy0 = (await must('GET', '/operations/policy')).body;
  const policy = (await must('PATCH', '/operations/policy', {
    expectedVersion: policy0.version,
    pauseBillingMode: 'STOP_CHARGING', managerOnlyPause: false, maxPauseMinutes: 30,
    moveRatePolicy: 'KEEP_SESSION_RATE', fixedSessionAutoExtend: false,
    fixedSessionWarningMinutes: [15, 5], defaultExtensionMinutes: 10
  })).body;
  ok('venue operations policy', { version: policy.version });

  const hourly = (await must('POST', '/operations/rate-plans', {
    name: `${marker} Hourly`, resourceCategoryId: cat.id, billingMode: 'HOURLY',
    hourlyRateMinor: 6000, roundingMinutes: 1, minimumMinutes: 0, priority: 500, active: true
  })).body;
  evidence.ids.hourlyRatePlanId = hourly.id;

  const starts = await Promise.all([
    request('POST', '/operations/sessions/start', { resourceId: r1.id, ratePlanId: hourly.id, participantCount: 2, notes: marker }),
    request('POST', '/operations/sessions/start', { resourceId: r1.id, ratePlanId: hourly.id, participantCount: 2, notes: marker })
  ]);
  const winners = starts.filter((x) => x.status >= 200 && x.status < 300);
  const losers = starts.filter((x) => x.status === 409);
  if (winners.length !== 1 || losers.length !== 1) fail('concurrent exclusive start', { statuses: starts.map((x) => x.status) });
  let session = winners[0].body;
  evidence.ids.concurrentSessionId = idOf(session);
  ok('concurrent exclusive start', { statuses: starts.map((x) => x.status) });

  const floor1 = floorRows((await must('GET', '/operations/floor')).body);
  const card1 = floor1.find((x) => x.id === r1.id);
  if (!card1?.session?.timer || typeof card1.session.timer.elapsedSeconds !== 'number') fail('server-authoritative floor timer', { card: card1 });
  await new Promise((r) => setTimeout(r, 2100));
  const floor2 = floorRows((await must('GET', '/operations/floor')).body);
  const card2 = floor2.find((x) => x.id === r1.id);
  const delta = card2.session.timer.elapsedSeconds - card1.session.timer.elapsedSeconds;
  if (delta < 1 || delta > 5) fail('timer accuracy / refresh projection', { before: card1.session.timer, after: card2.session.timer });
  ok('timer accuracy / refresh projection', { deltaSeconds: delta });

  session = (await must('POST', `/operations/sessions/${idOf(session)}/pause`, { expectedVersion: versionOf(session), reason: 'Phase 3 production pause segment' })).body;
  if (session.status !== 'PAUSED') fail('pause segment persistence', { session });
  ok('pause segment persistence', { version: session.version });
  const pausedVersion = versionOf(session);
  session = (await must('POST', `/operations/sessions/${idOf(session)}/resume`, { expectedVersion: pausedVersion })).body;
  ok('resume session', { version: session.version });

  const stale = await request('POST', `/operations/sessions/${idOf(session)}/move`, { expectedVersion: pausedVersion, resourceId: r2.id });
  if (stale.status !== 409) fail('stale version conflict', { status: stale.status, body: stale.body });
  ok('stale version conflict', { status: stale.status });

  session = (await must('POST', `/operations/sessions/${idOf(session)}/move`, { expectedVersion: versionOf(session), resourceId: r2.id })).body;
  if (session.resourceId !== r2.id) fail('resource move preserves session identity', { session });
  if (idOf(session) !== evidence.ids.concurrentSessionId) fail('resource move identity', { before: evidence.ids.concurrentSessionId, after: idOf(session) });
  ok('resource move preserves identity/history');
  session = (await must('POST', `/operations/sessions/${idOf(session)}/finish`, { expectedVersion: versionOf(session) })).body;
  if (!['FINISHED', 'ENDED'].includes(session.status)) fail('finish usage without settlement', { session });
  ok('finish usage without settlement', { status: session.status, accruedMinor: session.accruedMinor });

  const fixed = (await must('POST', '/operations/rate-plans', {
    name: `${marker} Fixed`, resourceId: r3.id, billingMode: 'FIXED_DURATION',
    unitPriceMinor: 3000, fixedDurationMinutes: 30, overtimeRateMinor: 6000,
    overtimeAfterMinutes: 30, priority: 1000, active: true
  })).body;
  let fixedSession = (await must('POST', '/operations/sessions/start', { resourceId: r3.id, ratePlanId: fixed.id, participantCount: 3, notes: marker })).body;
  let fixedCard = floorRows((await must('GET', '/operations/floor')).body).find((x) => x.id === r3.id);
  const beforeRemaining = fixedCard?.session?.timer?.remainingSeconds;
  if (!(beforeRemaining > 0)) fail('fixed-time countdown', { card: fixedCard });
  fixedSession = (await must('POST', `/operations/sessions/${idOf(fixedSession)}/extend`, { expectedVersion: versionOf(fixedSession), minutes: 10 })).body;
  fixedCard = floorRows((await must('GET', '/operations/floor')).body).find((x) => x.id === r3.id);
  const afterRemaining = fixedCard?.session?.timer?.remainingSeconds;
  if (!(afterRemaining > beforeRemaining + 500)) fail('fixed-time extension', { beforeRemaining, afterRemaining });
  ok('fixed-time countdown / extension', { beforeRemaining, afterRemaining });

  const wait = (await must('POST', '/operations/waitlist', {
    name: `${marker} Waitlist`, partySize: 4, requestedResourceType: 'BILLIARD', desiredDurationMinutes: 45,
    estimatedWaitMinutes: 1, notes: marker
  })).body;
  evidence.ids.waitlistId = wait.id;
  const seats = await Promise.all([
    request('POST', `/operations/waitlist/${wait.id}/seat`, { expectedVersion: wait.version, resourceId: r4.id, ratePlanId: hourly.id }),
    request('POST', `/operations/waitlist/${wait.id}/seat`, { expectedVersion: wait.version, resourceId: r4.id, ratePlanId: hourly.id })
  ]);
  const seatWins = seats.filter((x) => x.status >= 200 && x.status < 300);
  const seatLosses = seats.filter((x) => x.status === 409);
  if (seatWins.length !== 1 || seatLosses.length !== 1) fail('waitlist seat conflict', { statuses: seats.map((x) => x.status), bodies: seats.map((x) => x.body) });
  const seatedBody = seatWins[0].body;
  let seatedSession = seatedBody.session || seatedBody.operationsSession || seatedBody;
  if (!idOf(seatedSession)) {
    const c = floorRows((await must('GET', '/operations/floor')).body).find((x) => x.id === r4.id);
    seatedSession = c?.session;
  }
  if (!idOf(seatedSession)) fail('waitlist seating creates session', { seatedBody });
  ok('waitlist seat conflict', { statuses: seats.map((x) => x.status) });
  seatedSession = (await must('POST', `/operations/sessions/${idOf(seatedSession)}/finish`, { expectedVersion: versionOf(seatedSession) })).body;

  const maintenance = (await must('POST', '/operations/maintenance', {
    resourceId: r4.id, reason: 'Phase 3 production maintenance guard', notes: marker,
    expectedReturnAt: new Date(Date.now() + 15 * 60_000).toISOString()
  })).body;
  evidence.ids.maintenanceId = maintenance.id;
  const blocked = await request('POST', '/operations/sessions/start', { resourceId: r4.id, ratePlanId: hourly.id, notes: marker });
  if (blocked.status !== 409) fail('maintenance start guard', { status: blocked.status, body: blocked.body });
  ok('maintenance start guard', { status: blocked.status });
  await must('DELETE', `/operations/maintenance/${maintenance.id}`);

  const group = (await must('POST', '/operations/session-groups', { name: `${marker} Group` })).body;
  let grouped = (await must('POST', '/operations/sessions/start', { resourceId: r1.id, ratePlanId: hourly.id, groupId: group.id, participantCount: 4, notes: marker })).body;
  if (grouped.participantCount !== 4) fail('group / participant capture', { grouped });
  ok('group / participant capture', { groupId: group.id, participantCount: grouped.participantCount });
  grouped = (await must('POST', `/operations/sessions/${idOf(grouped)}/cancel`, { expectedVersion: versionOf(grouped), reason: 'Phase 3 production cancellation acceptance' })).body;
  if (grouped.status !== 'CANCELLED') fail('audited cancellation', { grouped });
  ok('audited cancellation');

  const handover = (await must('GET', '/operations/handover')).body;
  if (!handover || typeof handover !== 'object') fail('shift handover projection', { handover });
  ok('shift handover projection');

  fixedSession = (await must('POST', `/operations/sessions/${idOf(fixedSession)}/finish`, { expectedVersion: versionOf(fixedSession) })).body;
  const finalFloor = floorRows((await must('GET', '/operations/floor')).body);
  const active = finalFloor.filter((x) => x.session && ['ACTIVE', 'PAUSED'].includes(x.session.status));
  const occupiedIds = active.map((x) => x.id);
  if (new Set(occupiedIds).size !== occupiedIds.length) fail('final exclusive occupancy invariant', { occupiedIds });
  if (active.length !== 0) fail('acceptance floor cleanup', { active: active.map((x) => ({ resourceId: x.id, sessionId: x.session?.id })) });
  ok('final exclusive occupancy invariant / no active residue');

  evidence.completedAt = new Date().toISOString();
  evidence.status = 'PASS';
  await writeFile('/tmp/phase3-production-acceptance.json', JSON.stringify(evidence, null, 2));
  console.log('PHASE3_PRODUCTION_ACCEPTANCE=PASS');
}

main().catch(async (error) => {
  evidence.completedAt = new Date().toISOString();
  evidence.status = 'FAIL';
  evidence.error = { message: error?.message || String(error), status: error?.status, payload: error?.payload };
  await writeFile('/tmp/phase3-production-acceptance.json', JSON.stringify(evidence, null, 2)).catch(() => {});
  console.error(error);
  process.exit(1);
});
