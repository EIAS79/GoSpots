import { AsyncLocalStorage } from 'async_hooks';
import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Postgres RLS session context (bible #3 / GO_SPOTS_RLS.md).
 *
 * When TENANT_RLS=on, venue-bound HTTP handlers run inside an interactive
 * transaction with SET LOCAL app.current_shop_id + app.rls_mode. PrismaService
 * proxies model / raw calls onto that transaction client so existing services
 * inherit the session without rewriting every query.
 *
 * Policies (migration 20260721050000_*) fail-open when app.rls_mode is unset so
 * Neon deploy + default-off flag stay safe; enforcement applies once mode is set.
 */

export type TenantRlsMode =
  | 'tenant'
  | 'public_insert'
  | 'system'
  | 'bypass';

export type TenantRlsSession = {
  shopId: string;
  mode: TenantRlsMode;
};

export type TenantRlsStore = TenantRlsSession & {
  tx: Prisma.TransactionClient;
};

export const tenantRlsAls = new AsyncLocalStorage<TenantRlsStore>();

/** Env `TENANT_RLS=true|1|on` — default off (backward compatible until soak). */
export function isTenantRlsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = (env.TENANT_RLS ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on';
}

export function getTenantRlsStore(): TenantRlsStore | undefined {
  return tenantRlsAls.getStore();
}

type RlsSqlClient = {
  $executeRaw: (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Prisma.PrismaPromise<unknown>;
};

/** SET LOCAL app.current_shop_id + app.rls_mode (must run inside a transaction). */
export async function applyTenantRlsSession(
  tx: RlsSqlClient,
  session: TenantRlsSession,
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_shop_id', ${session.shopId}, true)`;
  await tx.$executeRaw`SELECT set_config('app.rls_mode', ${session.mode}, true)`;
}

export type WithTenantRlsOptions = {
  maxWait?: number;
  timeout?: number;
};

/**
 * Open (or reuse) a transaction, SET LOCAL tenant context, run `fn` on the tx.
 * Prefer TenantRlsInterceptor for HTTP; use this for cron/public/scripts.
 */
export async function withTenantRls<T>(
  prisma: PrismaClient,
  session: TenantRlsSession,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: WithTenantRlsOptions,
): Promise<T> {
  const existing = tenantRlsAls.getStore();
  if (existing?.tx) {
    await applyTenantRlsSession(existing.tx, session);
    return tenantRlsAls.run({ ...existing, ...session }, () => fn(existing.tx));
  }

  return prisma.$transaction(
    async (tx) => {
      await applyTenantRlsSession(tx, session);
      return tenantRlsAls.run({ tx, ...session }, () => fn(tx));
    },
    {
      maxWait: options?.maxWait ?? 10_000,
      timeout: options?.timeout ?? 60_000,
    },
  );
}

const TX_RAW = new Set([
  '$executeRaw',
  '$queryRaw',
  '$executeRawUnsafe',
  '$queryRawUnsafe',
]);

/**
 * Proxy PrismaClient so model delegates + raw SQL hit the ALS transaction when
 * TenantRlsInterceptor / withTenantRls is active. Nested `$transaction(fn)`
 * reuses the same tx (savepoint-free; matches advisory-lock + finance nests).
 */
export function wrapPrismaWithTenantRls<T extends PrismaClient>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === '$transaction') {
        return (arg: unknown, options?: unknown) => {
          const store = tenantRlsAls.getStore();
          if (store?.tx) {
            if (typeof arg === 'function') {
              return (arg as (tx: Prisma.TransactionClient) => unknown)(
                store.tx,
              );
            }
            throw new Error(
              'Prisma $transaction(array) is not supported inside a tenant RLS request transaction',
            );
          }
          const txn = target.$transaction.bind(target);
          return options !== undefined
            ? txn(arg as never, options as never)
            : txn(arg as never);
        };
      }

      const store = tenantRlsAls.getStore();
      if (store?.tx && typeof prop === 'string') {
        if (TX_RAW.has(prop)) {
          const value = Reflect.get(store.tx, prop, store.tx) as (
            ...args: unknown[]
          ) => unknown;
          return value.bind(store.tx);
        }
        if (
          !prop.startsWith('$') &&
          prop !== 'then' &&
          prop in store.tx &&
          typeof (store.tx as Record<string, unknown>)[prop] === 'object'
        ) {
          return Reflect.get(store.tx, prop, store.tx);
        }
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as T;
}
