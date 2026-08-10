import { createHash, generateKeyPairSync, randomUUID, sign } from 'crypto';
import { EdgeHubService } from './edge-hub.service';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function signedHeaders(deviceId: string, privateKey: any, path: string, body: unknown) {
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const message = `POST\n${path}\n${timestamp}\n${nonce}\n${sha256(canonicalJson(body))}`;
  return {
    'x-edge-device-id': deviceId,
    'x-edge-timestamp': timestamp,
    'x-edge-nonce': nonce,
    'x-edge-signature': sign(null, Buffer.from(message), privateKey).toString('base64'),
  };
}

describe('EdgeHubService', () => {
  const flags: any = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
  const audit: any = { record: jest.fn(), recordForShop: jest.fn() };

  it('creates a one-time provisioning token bound to an EDGE_HUB device', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = {
      device: {
        findFirst: jest.fn().mockResolvedValue({ id: 'edge-1', shopId: 'shop-1', label: 'Venue Edge', type: 'EDGE_HUB', status: 'ACTIVE', metadata: null }),
        update,
      },
    };
    const service = new EdgeHubService(prisma, flags, audit, {} as any);
    const actor: any = { sub: 'owner-1', shopId: 'shop-1', shopRole: 'OWNER', perms: '*' };
    const result = await service.createProvisioningToken(actor, 'edge-1');
    expect(result.provisioningToken).toMatch(/^edge-1\./);
    const metadata = update.mock.calls[0][0].data.metadata;
    expect(metadata.edge.provisionTokenHash).toHaveLength(64);
    expect(metadata.edge.provisionTokenHash).not.toContain(result.provisioningToken);
  });

  it('consumes provisioning under a transaction-scoped advisory lock', async () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const provisioningToken = `edge-1.${'secret-token-material'.repeat(2)}`;
    const device: any = {
      id: 'edge-1', shopId: 'shop-1', label: 'Venue Edge', type: 'EDGE_HUB', status: 'ACTIVE',
      metadata: { edge: { provisionTokenHash: sha256(provisioningToken), provisionExpiresAt: new Date(Date.now() + 60_000).toISOString() } },
    };
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      device: {
        findFirst: jest.fn().mockResolvedValue(device),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma: any = {
      device: { findFirst: jest.fn().mockResolvedValue({ shopId: 'shop-1' }) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = new EdgeHubService(prisma, flags, audit, {} as any);
    const result = await service.register({ provisioningToken, publicKeyPem, version: '0.1.0', hostname: 'edge-host' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.device.findFirst).toHaveBeenCalledTimes(1);
    const update = tx.device.update.mock.calls[0][0];
    expect(update.data.metadata.edge.provisionTokenHash).toBeUndefined();
    expect(update.data.metadata.edge.provisionUsedAt).toEqual(expect.any(String));
    expect(result).toMatchObject({ deviceId: 'edge-1', shopId: 'shop-1' });
  });

  it('authenticates an Ed25519 signed replay, cleans expired nonces and namespaces LAN device identity', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const device = {
      id: 'edge-1', shopId: 'shop-1', label: 'Venue Edge', type: 'EDGE_HUB', status: 'ACTIVE',
      metadata: { edge: { publicKeyPem, registeredAt: new Date().toISOString() } },
    };
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const create = jest.fn().mockResolvedValue({});
    const prisma: any = {
      device: { findFirst: jest.fn().mockResolvedValue(device), update: jest.fn() },
      idempotencyReceipt: { deleteMany, create },
    };
    const offline: any = { applyEdgeOperation: jest.fn().mockResolvedValue({ syncState: 'SYNCED' }) };
    const service = new EdgeHubService(prisma, flags, audit, offline);
    const body: any = {
      operationId: '11111111-1111-4111-8111-111111111111', deviceId: 'pos-a', operationType: 'CHECK_CREATE',
      entityId: 'check-1', payloadHash: 'a'.repeat(64), payload: {},
    };
    const headers = signedHeaders('edge-1', privateKey, '/edge-hub/cloud/replay', body);
    await expect(service.replay(headers, body)).resolves.toEqual({ syncState: 'SYNCED' });
    expect(deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ shopId: 'shop-1', scope: 'edge.auth.nonce.v1' }),
    }));
    expect(create.mock.calls[0][0].data.expiresAt).toBeInstanceOf(Date);
    expect(offline.applyEdgeOperation).toHaveBeenCalledWith(
      'shop-1', 'edge-1', expect.objectContaining({ deviceId: 'edge:edge-1:pos-a' }),
    );
  });

  it('rejects a reused signed nonce before replaying twice', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const prisma: any = {
      device: { findFirst: jest.fn().mockResolvedValue({ id: 'edge-1', shopId: 'shop-1', type: 'EDGE_HUB', status: 'ACTIVE', metadata: { edge: { publicKeyPem, registeredAt: new Date().toISOString() } } }) },
      idempotencyReceipt: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValueOnce({}).mockRejectedValueOnce({ code: 'P2002' }),
      },
    };
    const offline: any = { applyEdgeOperation: jest.fn().mockResolvedValue({ syncState: 'SYNCED' }) };
    const service = new EdgeHubService(prisma, flags, audit, offline);
    const body: any = { operationId: '22222222-2222-4222-8222-222222222222', deviceId: 'pos-a', operationType: 'CHECK_CREATE', entityId: 'check-2', payloadHash: 'b'.repeat(64), payload: {} };
    const headers = signedHeaders('edge-1', privateKey, '/edge-hub/cloud/replay', body);
    await service.replay(headers, body);
    await expect(service.replay(headers, body)).rejects.toThrow('nonce was already used');
    expect(offline.applyEdgeOperation).toHaveBeenCalledTimes(1);
  });
});
