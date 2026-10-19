/**
 * Isolated local PostgreSQL 17-compatible integration proof.
 * Creates scratch table + unprivileged role ONLY in an explicitly marked
 * disposable localhost database; never point this script at shared services.
 * Run: GOSPOTS_DISPOSABLE_E2E_DB=I_UNDERSTAND_DELETE_AND_ROLES
 *      DATABASE_URL=postgresql://...@127.0.0.1:55441/gospots_w1_probe
 *      pnpm --dir apps/api exec tsx prisma/w1-tenant-context-integration.ts
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  applyTenantRlsSession,
  withTenantRls,
  wrapPrismaWithTenantRls,
} from '../src/common/tenant-rls.util';

const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/invalid');
if (
  process.env.GOSPOTS_DISPOSABLE_E2E_DB !== 'I_UNDERSTAND_DELETE_AND_ROLES' ||
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  !url.pathname.startsWith('/gospots_w1_')
) {
  throw new Error(
    'REFUSED: only explicit disposable localhost gospots_w1_* DB',
  );
}
const root = new PrismaClient();
const role = 'gospots_w1_probe_reader';
const table = 'w1_rls_probe';
const actorUrl = new URL(url.toString());
actorUrl.username = role;
const testRolePassword = randomBytes(32).toString('hex');
actorUrl.password = testRolePassword;
const actor = new PrismaClient({
  datasources: { db: { url: actorUrl.toString() } },
});
const wrapped = wrapPrismaWithTenantRls(actor);
const shopA = 'shop-w1-a';
const shopB = 'shop-w1-b';
let assertions = 0;
function eq<T>(actual: T, expected: T) {
  assert.deepEqual(actual, expected);
  assertions += 1;
}
async function rows(shopId: string): Promise<string[]> {
  return withTenantRls(wrapped, { shopId, mode: 'tenant' }, async (tx) => {
    const entries = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM w1_rls_probe ORDER BY id`;
    return entries.map((item) => item.id);
  });
}
async function main() {
  let roleCreated = false;
  try {
    const versionRows = await root.$queryRaw<
      Array<{ serverVersion: string }>
    >`SELECT current_setting('server_version') AS "serverVersion"`;
    const postgresMajor = Number(versionRows[0]?.serverVersion.split('.')[0]);
    assert.ok(
      Number.isInteger(postgresMajor) && postgresMajor >= 17,
      'PostgreSQL version must be identifiable',
    );
    const expectedMajor = process.env.GOSPOTS_W1_EXPECT_PG_MAJOR;
    if (expectedMajor) {
      assert.equal(
        postgresMajor,
        Number(expectedMajor),
        'Connected database is not the expected PostgreSQL major version',
      );
      assertions += 1;
    }
    // Random test-only SCRAM credential: never write it to logs.
    await root.$executeRawUnsafe(
      `CREATE ROLE ${role} LOGIN PASSWORD '${testRolePassword}'`,
    );
    roleCreated = true;
    await root.$executeRawUnsafe(
      `CREATE TABLE ${table} (id text PRIMARY KEY, shop_id text NOT NULL, description text)`,
    );
    await root.$executeRawUnsafe(
      `INSERT INTO ${table} (id,shop_id) VALUES ('a1','${shopA}'),('b1','${shopB}')`,
    );
    await root.$executeRawUnsafe(
      `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
    );
    await root.$executeRawUnsafe(
      `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`,
    );
    await root.$executeRawUnsafe(`CREATE POLICY w1_tenant_guard ON ${table}
      TO ${role}
      USING (
        shop_id = current_setting('app.current_shop_id', true)
        AND current_setting('app.rls_mode', true) = 'tenant'
      )
      WITH CHECK (
        shop_id = current_setting('app.current_shop_id', true)
        AND current_setting('app.rls_mode', true) = 'tenant'
      )`);
    await root.$executeRawUnsafe(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO ${role}`,
    );
    // Disposable-only fault injection verifies role/table cleanup if an
    // assertion fails after setup; never skips any security assertion in CI.
    if (process.env.GOSPOTS_W1_FORCE_FAILURE_AFTER_SETUP === 'true') {
      throw new Error('W1 deliberate cleanup-check failure after setup');
    }
    eq(await rows(shopA), ['a1']);
    eq(await rows(shopB), ['b1']);
    eq(await Promise.all([rows(shopA), rows(shopB)]), [['a1'], ['b1']]);

    await withTenantRls(
      wrapped,
      { shopId: shopA, mode: 'tenant' },
      async (tx) => {
        await assert.rejects(
          withTenantRls(wrapped, { shopId: shopB, mode: 'tenant' }, () =>
            Promise.resolve(undefined),
          ),
          /Cannot change tenant or privilege mode/,
        );
        assertions += 1;
        await assert.rejects(
          withTenantRls(wrapped, { shopId: shopA, mode: 'system' }, () =>
            Promise.resolve(undefined),
          ),
          /Cannot change tenant or privilege mode/,
        );
        assertions += 1;
        await assert.rejects(
          applyTenantRlsSession(tx, { shopId: shopB, mode: 'tenant' }),
          /Cannot change tenant or privilege mode/,
        );
        assertions += 1;
        eq(
          (
            await tx.$queryRaw<
              Array<{ id: string }>
            >`SELECT id FROM w1_rls_probe`
          ).map((r) => r.id),
          ['a1'],
        );
      },
    );

    for (const mode of ['system', 'bypass', 'public_insert'] as const) {
      await withTenantRls(wrapped, { shopId: shopA, mode }, async (tx) => {
        eq(
          await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM w1_rls_probe`,
          [],
        );
      });
    }
    // Direct unbound pooled queries must never inherit the prior SET LOCAL.
    for (let i = 0; i < 3; i += 1) {
      eq(
        await actor.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM w1_rls_probe`,
        [],
      );
      eq(await rows(i % 2 ? shopB : shopA), [i % 2 ? 'b1' : 'a1']);
    }
    await assert.rejects(
      withTenantRls(wrapped, { shopId: shopA, mode: 'tenant' }, async (tx) => {
        eq(
          await tx.$executeRaw`UPDATE w1_rls_probe SET description='safe' WHERE id='b1'`,
          0,
        );
        // Fail the test if a forbidden INSERT unexpectedly succeeds.
        await tx.$executeRaw`INSERT INTO w1_rls_probe(id,shop_id) VALUES ('forged',${shopB})`;
      }),
      /row-level security policy|42501/,
    );
    assertions += 1;
    eq(await rows(shopB), ['b1']);
    eq(
      await actor.$queryRaw<Array<{ id: string }>>`SELECT id FROM w1_rls_probe`,
      [],
    );
    await assert.rejects(
      withTenantRls(wrapped, { shopId: shopA, mode: 'tenant' }, async (tx) => {
        await tx.$executeRaw`INSERT INTO w1_rls_probe(id,shop_id) VALUES ('rollback',${shopA})`;
        throw new Error('expected rollback');
      }),
      /expected rollback/,
    );
    assertions += 1;
    eq(await rows(shopA), ['a1']);
    eq(
      await actor.$queryRaw<Array<{ id: string }>>`SELECT id FROM w1_rls_probe`,
      [],
    );
    eq(await Promise.all([rows(shopA), rows(shopB), rows(shopA)]), [
      ['a1'],
      ['b1'],
      ['a1'],
    ]);
    console.log(
      JSON.stringify({
        success: true,
        assertions,
        postgres: 'DISPOSABLE',
        postgresMajor,
        positiveShops: 2,
        context: 'SET LOCAL',
        poolReset: true,
        rollback: true,
      }),
    );
  } finally {
    try {
      await actor.$disconnect();
    } finally {
      try {
        await root.$executeRawUnsafe(`DROP TABLE IF EXISTS ${table}`);
      } finally {
        try {
          if (roleCreated) {
            await root.$executeRawUnsafe(`DROP ROLE IF EXISTS ${role}`);
          }
        } finally {
          await root.$disconnect();
        }
      }
    }
  }
}
main().catch((error: unknown) => {
  console.error('W1 isolated tenant integration FAILED', error);
  process.exitCode = 1;
});
