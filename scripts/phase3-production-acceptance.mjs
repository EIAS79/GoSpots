import { writeFile } from 'node:fs/promises';

const base = (process.env.GOSPOTS_BASE_URL || 'https://www.gospots.eu/api/v1').replace(/\/$/, '');
const venue = process.env.GOSPOTS_ACCEPTANCE_VENUE || 'acceptance-c6c8541bec76';
let token = process.env.PHASE3_ACCESS_TOKEN;
const runId = process.env.GITHUB_RUN_ID || String(Date.now());
const marker = `P3-PROD-${runId}`;
const evidence = { marker, base, venue, startedAt: new Date().toISOString(), checks: [], ids: {} };

function ok(name, detail = {}) { evidence.checks.push({ name, status: 'PASS', ...detail }); console.log(`PASS ${name}`); }
function fail(name, detail = {}) { evidence.checks.push({ name, status: 'FAIL', ...detail }); throw new Error(`${name}: ${JSON.stringify(detail)}`); }
function parseJson(text) { if (!text) return null; try { return JSON.parse(text); } catch { return text; } }
async function request(method, path, body, auth = token) {
  const headers = { accept: 'application/json' };
  if (auth) headers.authorization = `Bearer ${auth}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  return { status: res.status, body: parseJson(await res.text()), headers: res.headers };
}
async function must(method, path, body, auth = token) {
  const result = await request(method, path, body, auth);
  if (result.status < 200 || result.status >= 300) throw new Error(`${method} ${path} -> ${result.status}: ${JSON.stringify(result.body).slice(0, 1000)}`);
  return result;
}
function cookie(headers, name) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie') || ''];
  for (const value of values) { const m = value.match(new RegExp(`(?:^|[,;]\\s*)${name}=([^;]+)`)); if (m) return decodeURIComponent(m[1]); }
  return null;
}
function idOf(x) { return x?.id || x?.session?.id || x?.data?.id; }
function versionOf(x) { return x?.version ?? x?.session?.version ?? x?.data?.version; }
function floorRows(body) { return Array.isArray(body) ? body : body?.resources || body?.floor || []; }
function waitRows(body) { return Array.isArray(body) ? body : body?.entries || body?.waitlist || []; }
function waitVersion(x) { return x?.operations?.version ?? x?.extension?.version ?? x?.version; }
function waitId(x) { return x?.id ?? x?.entry?.id ?? x?.waitlistEntry?.id; }
function waitName(x) { return x?.guestName ?? x?.name ?? x?.entry?.guestName ?? ''; }

async function cleanupPriorAcceptanceResidue() {
  const floor = floorRows((await must('GET', '/operations/floor')).body);
  let cancelledSessions = 0;
  for (const row of floor) {
    const s = row?.session;
    if (!s || !['ACTIVE', 'PAUSED'].includes(s.status) || !String(s.notes || '').startsWith('P3-PROD-')) continue;
    await must('POST', `/operations/sessions/${s.id}/cancel`, { expectedVersion: s.version, reason: 'Cleanup from previous Phase 3 production acceptance run' });
    cancelledSessions += 1;
  }
  const waitlist = waitRows((await must('GET', '/operations/waitlist')).body);
  let cancelledWaitlist = 0;
  for (const entry of waitlist) {
    if (!waitName(entry).startsWith('P3-PROD-')) continue;
    const id = waitId(entry); const version = waitVersion(entry);
    if (!id || !Number.isInteger(version) || version < 1) continue;
    const result = await request('POST', `/operations/waitlist/${id}/cancel`, { expectedVersion: version });
    if (result.status >= 200 && result.status < 300) cancelledWaitlist += 1;
    else if (result.status !== 409) throw new Error(`cleanup waitlist ${id} -> ${result.status}: ${JSON.stringify(result.body)}`);
  }
  ok('prior acceptance residue cleanup', { cancelledSessions, cancelledWaitlist });
}

async function getOrCreateAcceptanceArena() {
  let catalog = (await must('GET', '/resources/catalog')).body;
  let cat = catalog.categories.find((c) => c.type === 'BILLIARD' && Array.isArray(c.resources) && c.resources.length >= 4);
  if (!cat) {
    const created = (await must('POST', '/resources/categories', {
      type: 'BILLIARD', name: `${marker} Billiards`, description: 'Isolated Phase 3 production acceptance floor',
      slotMinutes: 60, unitCount: 4, unitNamePrefix: 'P3-T', rates: [{ label: 'Hourly', price: 60 }]
    })).body;
    catalog = (await must('GET', '/resources/catalog')).body;
    cat = catalog.categories.find((c) => c.id === created.id);
  }
  if (!cat || !Array.isArray(cat.resources) || cat.resources.length < 4) fail('acceptance floor provisioning', { category: cat });
  evidence.ids.categoryId = cat.id;
  ok('acceptance floor provisioning', { categoryId: cat.id, reused: !String(cat.name || '').startsWith(marker), resources: cat.resources.slice(0, 4).map((r) => r.id) });
  return cat;
}

async function main() {
  const ready = await must('GET', '/ready', undefined, null);
  if (ready.body?.status !== 'ok') fail('production readiness', { body: ready.body });
  ok('production readiness', { body: ready.body });
  if (!token) fail('bootstrap access token missing');
  const bound = await must('POST', `/auth/venue/${encodeURIComponent(venue)}/session`, undefined, token);
  const boundToken = cookie(bound.headers, 'access_token');
  if (!boundToken) fail('venue-scoped token bind', { response: bound.body });
  token = boundToken;
  ok('venue-scoped authentication');
  await cleanupPriorAcceptanceResidue();

  const cat = await getOrCreateAcceptanceArena();
  const [r1, r2, r3, r4] = cat.resources;
  Object.assign(evidence.ids, { r1: r1.id, r2: r2.id, r3: r3.id, r4: r4.id });

  const policy0 = (await must('GET', '/operations/policy')).body;
  const policy = (await must('PATCH', '/operations/policy', {
    expectedVersion: policy0.version, pauseBillingMode: 'STOP_CHARGING', managerOnlyPause: false, maxPauseMinutes: 30,
    moveRatePolicy: 'KEEP_SESSION_RATE', fixedSessionAutoExtend: false, fixedSessionWarningMinutes: [15, 5], defaultExtensionMinutes: 10
  })).body;
  ok('venue operations policy', { version: policy.version });

  const hourly = (await must('POST', '/operations/rate-plans', {
    name: `${marker} Hourly`, resourceCategoryId: cat.id, billingMode: 'HOURLY', hourlyRateMinor: 6000,
    roundingMinutes: 1, minimumMinutes: 0, priority: 500, active: true
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

  const card1 = floorRows((await must('GET', '/operations/floor')).body).find((x) => x.id === r1.id);
  if (!card1?.session?.timer || typeof card1.session.timer.elapsedSeconds !== 'number') fail('server-authoritative floor timer', { card: card1 });
  await new Promise((r) => setTimeout(r, 2100));
  const card2 = floorRows((await must('GET', '/operations/floor')).body).find((x) => x.id === r1.id);
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
  ok('stale version conflict', { httpStatus: stale.status });
  session = (await must('POST', `/operations/sessions/${idOf(session)}/move`, { expectedVersion: versionOf(session), resourceId: r2.id })).body;
  if (session.resourceId !== r2.id || idOf(session) !== evidence.ids.concurrentSessionId) fail('resource move preserves session identity', { session });
  ok('resource move preserves identity/history');
  session = (await must('POST', `/operations/sessions/${idOf(session)}/finish`, { expectedVersion: versionOf(session) })).body;
  if (!['FINISHED', 'ENDED'].includes(session.status)) fail('finish usage without settlement', { session });
  ok('finish usage without settlement', { sessionStatus: session.status, accruedMinor: session.accruedMinor });

  const fixed = (await must('POST', '/operations/rate-plans', {
    name: `${marker} Fixed`, resourceId: r3.id, billingMode: 'FIXED_DURATION', unitPriceMinor: 3000,
    fixedDurationMinutes: 30, overtimeRateMinor: 6000, overtimeAfterMinutes: 30, priority: 1000, active: true
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
  const waitIdValue = waitId(wait); const waitVersionValue = waitVersion(wait);
  if (!waitIdValue || !Number.isInteger(waitVersionValue) || waitVersionValue < 1) fail('waitlist create contract', { wait });
  evidence.ids.waitlistId = waitIdValue;
  ok('waitlist create contract', { version: waitVersionValue });
  const seats = await Promise.all([
    request('POST', `/operations/waitlist/${waitIdValue}/seat`, { expectedVersion: waitVersionValue, resourceId: r4.id, ratePlanId: hourly.id }),
    request('POST', `/operations/waitlist/${waitIdValue}/seat`, { expectedVersion: waitVersionValue, resourceId: r4.id, ratePlanId: hourly.id })
  ]);
  const seatWins = seats.filter((x) => x.status >= 200 && x.status < 300);
  const seatLosses = seats.filter((x) => x.status === 409);
  if (seatWins.length !== 1 || seatLosses.length !== 1) fail('waitlist seat conflict', { statuses: seats.map((x) => x.status), bodies: seats.map((x) => x.body) });
  let seatedSession = seatWins[0].body?.session || seatWins[0].body?.operationsSession;
  if (!idOf(seatedSession)) seatedSession = floorRows((await must('GET', '/operations/floor')).body).find((x) => x.id === r4.id)?.session;
  if (!idOf(seatedSession)) fail('waitlist seating creates session', { body: seatWins[0].body });
  ok('waitlist seat conflict', { statuses: seats.map((x) => x.status) });
  await must('POST', `/operations/sessions/${idOf(seatedSession)}/finish`, { expectedVersion: versionOf(seatedSession) });

  const maintenance = (await must('POST', '/operations/maintenance', {
    resourceId: r4.id, reason: 'Phase 3 production maintenance guard', notes: marker,
    expectedReturnAt: new Date(Date.now() + 15 * 60_000).toISOString()
  })).body;
  evidence.ids.maintenanceId = maintenance.id;
  const blocked = await request('POST', '/operations/sessions/start', { resourceId: r4.id, ratePlanId: hourly.id, notes: marker });
  if (blocked.status !== 409) fail('maintenance start guard', { status: blocked.status, body: blocked.body });
  ok('maintenance start guard', { httpStatus: blocked.status });
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

  await must('POST', `/operations/sessions/${idOf(fixedSession)}/finish`, { expectedVersion: versionOf(fixedSession) });
  const finalFloor = floorRows((await must('GET', '/operations/floor')).body);
  const active = finalFloor.filter((x) => x.session && ['ACTIVE', 'PAUSED'].includes(x.session.status));
  const occupiedIds = active.map((x) => x.id);
  if (new Set(occupiedIds).size !== occupiedIds.length) fail('final exclusive occupancy invariant', { occupiedIds });
  if (active.some((x) => String(x.session?.notes || '').startsWith('P3-PROD-'))) fail('acceptance floor cleanup', { active: active.map((x) => ({ resourceId: x.id, sessionId: x.session?.id })) });
  ok('final exclusive occupancy invariant / no active acceptance residue');

  evidence.completedAt = new Date().toISOString(); evidence.status = 'PASS';
  await writeFile('/tmp/phase3-production-acceptance.json', JSON.stringify(evidence, null, 2));
  console.log('PHASE3_PRODUCTION_ACCEPTANCE=PASS');
}
main().catch(async (error) => { evidence.completedAt = new Date().toISOString(); evidence.status = 'FAIL'; evidence.error = { message: error?.message || String(error) }; await writeFile('/tmp/phase3-production-acceptance.json', JSON.stringify(evidence, null, 2)).catch(() => {}); console.error(error); process.exit(1); });
