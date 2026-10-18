/** Shared isolated-unit-test transaction scaffold. Not used by runtime. */
export function attachPrintIncidentTransactionMock(prisma: any) {
  prisma.$transaction = jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma));
  prisma.membership = {
    findUnique: jest.fn().mockResolvedValue({ id: 'tenant-member', role: 'MANAGER', isActive: true }),
  };
  prisma.shop = { findUnique: jest.fn().mockResolvedValue({ ownerId: 'test-owner' }) };
  prisma.printIncidentCase = {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(async ({ data }: any) => ({
      ...data, version: 1, state: data.state ?? 'OPEN', physicalOutcome: null,
    })),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  prisma.printIncidentEvent = {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'test-event' }),
  };
  return prisma;
}
