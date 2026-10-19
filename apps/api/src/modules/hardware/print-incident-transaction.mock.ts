/** Shared isolated-unit-test transaction scaffold. Not used by runtime. */

type TestCaseCreateArgs = {
  data: Record<string, unknown> & { state?: string };
};

/**
 * Retains the caller's existing mocked Prisma delegates while installing
 * transaction-aware incident delegates for unit tests only.
 */
export function attachPrintIncidentTransactionMock<T extends object>(
  prisma: T,
) {
  const transaction = jest.fn(
    (callback: (client: T) => Promise<unknown>): Promise<unknown> =>
      callback(prisma),
  );

  return Object.assign(prisma, {
    $transaction: transaction,
    membership: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 'tenant-member',
          role: 'MANAGER',
          isActive: true,
        }),
      ),
    },
    shop: {
      findUnique: jest.fn(() => Promise.resolve({ ownerId: 'test-owner' })),
    },
    printIncidentCase: {
      findUnique: jest.fn((): Promise<null> => Promise.resolve(null)),
      create: jest.fn(({ data }: TestCaseCreateArgs) =>
        Promise.resolve({
          ...data,
          version: 1,
          state: data.state ?? 'OPEN',
          physicalOutcome: null,
        }),
      ),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    printIncidentEvent: {
      findUnique: jest.fn((): Promise<null> => Promise.resolve(null)),
      create: jest.fn(() => Promise.resolve({ id: 'test-event' })),
    },
  });
}
