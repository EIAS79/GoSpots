import { writeFile } from 'node:fs/promises';

const base = (process.env.GOSPOTS_BASE_URL || 'https://www.gospots.eu/api/v1').replace(/\/$/, '');
const runId = process.env.GITHUB_RUN_ID || String(Date.now());
const suffix = `${runId}-${Math.random().toString(36).slice(2, 8)}`;
const marker = `P4-PROD-${suffix}`;
const venuePath = `p4-accept-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
const evidence = { marker, base, venuePath, startedAt: new Date().toISOString(), checks: [], ids: {} };
let token = null;

function pass(name, detail = {}) { evidence.checks.push({ name, status: 'PASS', ...detail }); console.log(`PASS ${name}`); }
function fail(name, detail = {}) { evidence.checks.push({ name, status: 'FAIL', ...detail }); throw new Error(`${name}: ${JSON.stringify(detail)}`); }
function parseJson(text) { if (!text) return null; try { return JSON.parse(text); } catch { return text; } }
function cookie(headers, name) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie') || ''];
  for (const value of values) { const m = value.match(new RegExp(`(?:^|[,;]\\s*)${name}=([^;]+)`)); if (m) return decodeURIComponent(m[1]); }
  return null;
}
async function request(method, path, body, options = {}) {
  const headers = { accept: 'application/json', ...(options.headers || {}) };
  if (options.auth !== false && token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  return { status: response.status, body: parseJson(await response.text()), headers: response.headers };
}
async function must(method, path, body, options = {}) {
  const result = await request(method, path, body, options);
  if (result.status < 200 || result.status >= 300) throw new Error(`${method} ${path} -> ${result.status}: ${JSON.stringify(result.body).slice(0, 1500)}`);
  return result;
}

async function registerAcceptanceVenue() {
  const csrf = await must('GET', '/auth/csrf', undefined, { auth: false });
  const csrfToken = cookie(csrf.headers, 'csrf_token');
  if (!csrfToken) fail('CSRF bootstrap', { body: csrf.body });
  const registered = await request('POST', '/auth/register', {
    email: `p4-${suffix}@gospots.local`, password: `P4-Accept-${runId}!Aa9`, name: 'Phase 4 Acceptance Owner',
    businessLegalName: `Phase 4 Acceptance ${suffix}`, businessCountryCode: 'PL',
    businessId: `P4${suffix.replace(/[^a-z0-9]/gi, '').slice(-24)}`, shopName: 'Phase 4 Acceptance Venue',
    shopSlug: venuePath, packId: 'mixed', venueType: 'mixed', city: 'Warsaw', country: 'PL',
  }, { auth: false, headers: { cookie: `csrf_token=${encodeURIComponent(csrfToken)}`, 'x-csrf-token': csrfToken } });
  if (registered.status < 200 || registered.status >= 300) fail('fresh production venue registration', { status: registered.status, body: registered.body });
  token = cookie(registered.headers, 'access_token');
  if (!token) fail('fresh production venue authentication', { body: registered.body });
  const me = (await must('GET', '/auth/me')).body;
  const activeMembership = me?.memberships?.find((membership) => membership?.isActive && membership?.shop?.slug === venuePath)
    || me?.memberships?.find((membership) => membership?.isActive);
  const shopId = me?.shopId || activeMembership?.shop?.id;
  if (!shopId || activeMembership?.role !== 'OWNER') fail('venue-scoped owner authentication', { me });
  evidence.ids.shopId = shopId; evidence.ids.ownerId = me.id || me.userId || me.sub || null;
  pass('fresh production venue registration / owner authentication', { venuePath, shopId });
}

async function main() {
  const ready = await must('GET', '/ready', undefined, { auth: false });
  if (ready.body?.status !== 'ok') fail('production readiness', { body: ready.body });
  pass('production readiness', { database: ready.body?.database });
  await registerAcceptanceVenue();

  const settings = (await must('GET', '/shop/settings')).body;
  await must('PATCH', '/shop/settings', { expectedVersion: settings.shop.version, legalName: `Phase 4 Acceptance ${suffix}`, venueType: 'mixed', address: 'Acceptance 4', city: 'Warsaw', country: 'PL', timezone: 'Europe/Warsaw', businessDayStartMinutes: 240, locale: 'en' });
  const template = (await must('POST', '/shop/onboarding/apply-template', { templateId: 'mixed_activity' }, { idempotencyKey: `${marker}-template` })).body;
  if (!Array.isArray(template.categoryIds) || !template.categoryIds.length) fail('mixed venue template provisioning', { template });
  const catalog = (await must('GET', '/resources/catalog')).body;
  const resource = catalog.categories?.flatMap((category) => category.resources || [])[0];
  if (!resource?.id) fail('production resource availability', { catalog });
  evidence.ids.resourceId = resource.id; pass('mixed venue template / resource provisioning', { resourceId: resource.id });

  const check = (await must('POST', '/guest-checks', { guestName: 'Phase 4 Production Guest', partySize: 2, label: marker, note: 'Production Gate P4 isolated acceptance check' })).body;
  evidence.ids.checkId = check.id; pass('canonical GuestCheck creation', { checkId: check.id, version: check.version });

  const ratePlan = (await must('POST', '/operations/rate-plans', { name: `${marker} fixed session`, resourceId: resource.id, billingMode: 'FIXED_DURATION', unitPriceMinor: 1200, fixedDurationMinutes: 30, priority: 5000, active: true })).body;
  evidence.ids.ratePlanId = ratePlan.id;
  let ops = (await must('POST', '/operations/sessions/start', { resourceId: resource.id, ratePlanId: ratePlan.id, guestCheckId: check.id, participantCount: 2, notes: marker })).body;
  ops = (await must('POST', `/operations/sessions/${ops.id}/finish`, { expectedVersion: ops.version })).body;
  evidence.ids.operationsSessionId = ops.id;
  if (!['FINISHED', 'ENDED'].includes(ops.status)) fail('timed revenue finalization', { ops });
  pass('timed revenue finalization', { operationsSessionId: ops.id, accruedMinor: ops.accruedMinor });

  const item = (await must('POST', '/menu/items', { name: `${marker} product`, kind: 'PRODUCT', unit: 'EA', sku: `P4-${runId}`.slice(0, 80), price: 20, trackStock: false, isAvailable: true })).body;
  evidence.ids.menuItemId = item.id;
  const order = (await must('POST', '/finance/orders', { label: `${marker} product order`, guestCount: 2 }, { idempotencyKey: `${marker}-order-create` })).body;
  evidence.ids.shopOrderId = order.id;
  await must('POST', `/finance/orders/${order.id}/lines`, { menuItemId: item.id, quantity: 1 }, { idempotencyKey: `${marker}-order-line` });
  await must('PATCH', `/finance/orders/${order.id}`, { status: 'COMPLETED' }, { idempotencyKey: `${marker}-order-complete` });
  await must('POST', `/guest-checks/${check.id}/attach`, { shopOrderId: order.id });
  pass('product revenue attached to canonical GuestCheck', { shopOrderId: order.id });

  let context = (await must('GET', `/commercial/checks/${check.id}`)).body;
  await must('PUT', `/commercial/checks/${check.id}/profile`, { expectedCheckVersion: context.check.version, checkType: 'BAR_TAB', tableReference: 'P4-PROD-TAB', serviceArea: 'Acceptance bar' }, { idempotencyKey: `${marker}-profile` });
  context = (await must('GET', `/commercial/checks/${check.id}`)).body;
  const staleVersion = context.check.version;
  await must('POST', `/commercial/checks/${check.id}/adjustments`, { expectedCheckVersion: context.check.version, type: 'FIXED_DISCOUNT', scope: 'CHECK', amountMinor: 100, reason: 'Production Gate P4 authorized discount' }, { idempotencyKey: `${marker}-discount` });
  context = (await must('GET', `/commercial/checks/${check.id}`)).body;
  await must('POST', `/commercial/checks/${check.id}/service-charges`, { expectedCheckVersion: context.check.version, mode: 'FIXED', amountMinor: 50, reason: 'Production Gate P4 service charge' }, { idempotencyKey: `${marker}-service-charge` });
  context = (await must('GET', `/commercial/checks/${check.id}`)).body;
  await must('POST', `/commercial/checks/${check.id}/tips`, { expectedCheckVersion: context.check.version, method: 'OTHER', amountMinor: 75, note: 'Production Gate P4 gratuity' }, { idempotencyKey: `${marker}-tip` });
  context = (await must('GET', `/commercial/checks/${check.id}`)).body;
  if (context.adjustments?.filter((x) => !x.voidedAt).length !== 1 || context.serviceCharges?.filter((x) => !x.voidedAt).length !== 1 || context.tips?.filter((x) => !x.voidedAt).length !== 1) fail('separate commercial adjustments persistence', { context });
  pass('discount / service charge / gratuity persisted separately');

  const stale = await request('POST', `/commercial/checks/${check.id}/adjustments`, { expectedCheckVersion: staleVersion, type: 'FIXED_DISCOUNT', scope: 'CHECK', amountMinor: 1, reason: 'Production stale write proof' }, { idempotencyKey: `${marker}-stale` });
  if (stale.status !== 409) fail('stale commercial version conflict', { stale });
  pass('stale commercial version conflict', { httpStatus: stale.status });

  const guard = (await must('GET', '/commercial/day-close/open-tab-guard')).body;
  if (!guard.openChecks?.some((row) => row.id === check.id) || guard.policyAllowsOpenTabs !== false || guard.managerOverrideAvailable !== true) fail('unresolved-tab day-close manager-action contract', { guard });
  pass('unresolved-tab day-close manager-action contract', { allowed: guard.allowed, openTabCount: guard.openTabCount });

  const preview = (await must('POST', `/checkout/checks/${check.id}/preview`, {})).body;
  const sourceTypes = new Set((preview.lines || []).map((line) => line.sourceType));
  if (!preview.billReady || preview.blockers?.length || !sourceTypes.has('OPERATIONS_SESSION') || !sourceTypes.has('SHOP_ORDER') || !(Number(preview.commercial?.operationsSessionAmount) > 0)) fail('common revenue source unification', { sourceTypes: [...sourceTypes], preview });
  pass('timed + product revenue use one checkout authority', { sourceTypes: [...sourceTypes], operationsSessionAmount: preview.commercial.operationsSessionAmount, total: preview.total });

  const settlementKey = `${marker}-settlement`;
  const settlement = (await must('POST', `/checkout/checks/${check.id}/settlements`, { expectedVersion: preview.checkVersion }, { idempotencyKey: settlementKey })).body;
  const replay = (await must('POST', `/checkout/checks/${check.id}/settlements`, { expectedVersion: preview.checkVersion }, { idempotencyKey: settlementKey })).body;
  if (replay.id !== settlement.id) fail('duplicate checkout idempotency', { settlement, replay });
  evidence.ids.settlementId = settlement.id; pass('duplicate checkout idempotency', { settlementId: settlement.id });

  const groups = (await must('POST', `/checkout/settlements/${settlement.id}/payment-groups/preview`, { mode: 'EQUAL', parts: 2 })).body;
  if (groups.groups?.length !== 2) fail('equal split preview', { groups });
  const splitTotal = groups.groups.reduce((sum, group) => sum + Number(group.amount), 0);
  if (Math.abs(splitTotal - Number(settlement.total)) > 0.0001) fail('split conservation', { splitTotal, settlementTotal: settlement.total, groups });
  pass('equal split conservation / residual handling', { amounts: groups.groups.map((group) => group.amount), total: settlement.total });

  let state = (await must('GET', `/checkout/settlements/${settlement.id}/payment-state`)).body;
  for (const [index, group] of groups.groups.entries()) {
    state = (await must('POST', `/checkout/settlements/${settlement.id}/payments`, { expectedCheckVersion: state.guestCheckVersion, method: index === 0 ? 'MANUAL_CARD' : 'OTHER', allocationKind: 'EQUAL', allocations: group.allocations.map((a) => ({ snapshotId: a.snapshotId, amount: a.amount })), note: index === 0 ? 'Externally approved card payment' : 'Other received tender' }, { idempotencyKey: `${marker}-payment-${index + 1}` })).body;
    if (index === 0 && state.state !== 'PARTIALLY_PAID') fail('partial payment state', { state });
  }
  if (state.state !== 'PAID' || Number(state.amountDue) !== 0 || state.payments?.length !== 2) fail('mixed tender settlement completion', { state });
  evidence.ids.paymentIds = state.payments.map((p) => p.id); pass('partial payment and mixed tender settlement', { methods: state.payments.map((p) => p.method) });

  const closed = (await must('POST', `/checkout/checks/${check.id}/close`, {}, { idempotencyKey: `${marker}-close` })).body;
  if (closed.status !== 'SETTLED' || closed.settlementState !== 'CLOSED') fail('paid check close', { closed });
  const receipt = (await must('GET', `/checkout/settlements/${settlement.id}/receipt`)).body;
  if (!receipt || receipt.settlementId !== settlement.id || Number(receipt.totalMinor) <= 0) fail('immutable non-fiscal commercial receipt', { receipt });
  evidence.ids.receiptId = receipt.id; pass('immutable non-fiscal commercial receipt', { receiptId: receipt.id, totalMinor: receipt.totalMinor });

  const finalCheck = (await must('GET', `/guest-checks/${check.id}`)).body;
  const reopen = await request('POST', `/commercial/checks/${check.id}/reopen`, { expectedCheckVersion: finalCheck.version, reason: 'Production Gate P4 paid-fact mutation rejection' }, { idempotencyKey: `${marker}-reopen` });
  if (reopen.status !== 409) fail('paid-fact reopen boundary', { reopen });
  pass('paid-fact reopen boundary', { httpStatus: reopen.status, code: reopen.body?.code });

  const finalGuard = (await must('GET', '/commercial/day-close/open-tab-guard')).body;
  if (finalGuard.openChecks?.some((row) => row.id === check.id)) fail('closed tab removed from unresolved-tab guard', { finalGuard });
  pass('closed tab removed from unresolved-tab guard', { openTabCount: finalGuard.openTabCount });

  evidence.finishedAt = new Date().toISOString(); evidence.result = 'PASS';
  console.log('PHASE4_PRODUCTION_ACCEPTANCE=PASS');
}

try { await main(); }
catch (error) { evidence.finishedAt = new Date().toISOString(); evidence.result = 'FAIL'; evidence.error = error instanceof Error ? error.message : String(error); console.error(error); process.exitCode = 1; }
finally { await writeFile('/tmp/phase4-production-acceptance.json', JSON.stringify(evidence, null, 2)); }
