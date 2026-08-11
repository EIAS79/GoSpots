import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EdgeHub, EDGE_VERSION } from './hub.js';

const port = Number(process.env.EDGE_PORT ?? 8787);
const host = process.env.EDGE_HOST ?? '0.0.0.0';
const dbPath = process.env.EDGE_DB_PATH ?? join(process.cwd(), 'data', 'edge.db');
mkdirSync(dirname(dbPath), { recursive: true });
const hub = new EdgeHub({ dbPath });
const streams = new Set();

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function authHeaders(req, method, path, body) {
  hub.authenticateLan({
    clientId: req.headers['x-edge-client-id'],
    timestamp: req.headers['x-edge-timestamp'],
    nonce: req.headers['x-edge-nonce'],
    signature: req.headers['x-edge-signature'],
    method, path, body,
  });
}

hub.subscribe((event) => {
  const frame = `id: ${event.sequence}\nevent: edge-event\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of streams) res.write(frame);
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const path = `${url.pathname}${url.search}`;
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, version: EDGE_VERSION });
    if (req.method === 'GET' && url.pathname === '/v1/version') return send(res, 200, { version: EDGE_VERSION });

    if (req.method === 'POST' && url.pathname === '/v1/devices/register') {
      const body = await readJson(req);
      return send(res, 201, hub.registerLanClient(body.pairingToken, body.label));
    }

    if (req.method === 'POST' && url.pathname === '/v1/events') {
      const body = await readJson(req);
      authHeaders(req, 'POST', path, body);
      const event = hub.appendEvent({ ...body, sourceDeviceId: req.headers['x-edge-client-id'] });
      return send(res, event.duplicate ? 200 : 201, event);
    }

    if (req.method === 'GET' && url.pathname === '/v1/events') {
      authHeaders(req, 'GET', path, {});
      return send(res, 200, { events: hub.store.listEvents(Number(url.searchParams.get('after') ?? 0)) });
    }

    if (req.method === 'GET' && url.pathname === '/v1/stream') {
      authHeaders(req, 'GET', path, {});
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      for (const event of hub.store.listEvents(Number(url.searchParams.get('after') ?? 0))) {
        res.write(`id: ${event.sequence}\nevent: edge-event\ndata: ${JSON.stringify(event)}\n\n`);
      }
      streams.add(res);
      req.on('close', () => streams.delete(res));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/status') {
      authHeaders(req, 'GET', path, {});
      return send(res, 200, hub.status());
    }

    if (req.method === 'GET' && url.pathname === '/v1/diagnostics') {
      authHeaders(req, 'GET', path, {});
      return send(res, 200, hub.diagnostics());
    }

    if (req.method === 'POST' && url.pathname === '/v1/cloud/register') {
      const body = await readJson(req);
      authHeaders(req, 'POST', path, body);
      return send(res, 200, await hub.registerCloud(body.provisioningToken));
    }

    if (req.method === 'POST' && url.pathname === '/v1/cloud/sync') {
      const body = await readJson(req);
      authHeaders(req, 'POST', path, body);
      return send(res, 200, await hub.cloud.syncPending(Number(body.limit ?? 100)));
    }

    if (req.method === 'POST' && url.pathname === '/v1/cloud/print-once') {
      const body = await readJson(req);
      authHeaders(req, 'POST', path, body);
      return send(res, 200, await hub.processPrintQueue());
    }

    return send(res, 404, { message: 'Not found' });
  } catch (error) {
    const message = error?.message ?? String(error);
    const status = /signature|timestamp|nonce|pairing token|revoked|Unknown Edge client/i.test(message) ? 401
      : /CONFLICT/.test(message) ? 409 : /UNSUPPORTED/.test(message) ? 422 : 400;
    return send(res, status, { message });
  }
});

server.listen(port, host, async () => {
  console.log(`[gospots-edge] listening on http://${host}:${port}`);
  console.log(`[gospots-edge] pairing token (rotate after provisioning): ${hub.pairToken}`);
  if (process.env.EDGE_CLOUD_URL && process.env.EDGE_PROVISIONING_TOKEN && !hub.cloud.registeredDeviceId) {
    try { await hub.registerCloud(process.env.EDGE_PROVISIONING_TOKEN); console.log('[gospots-edge] cloud registration complete'); }
    catch (error) { console.error('[gospots-edge] cloud registration failed:', error?.message ?? error); }
  }
});

const syncTimer = setInterval(async () => {
  try {
    if (hub.cloud.registeredDeviceId) {
      await hub.cloud.syncPending();
      await hub.processPrintQueue();
      await hub.cloud.heartbeat(EDGE_VERSION);
    }
  } catch (error) {
    console.error('[gospots-edge] cloud sync:', error?.message ?? error);
  }
}, Number(process.env.EDGE_SYNC_INTERVAL_MS ?? 5000));
syncTimer.unref();

function shutdown() {
  clearInterval(syncTimer);
  server.close(() => { hub.close(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
