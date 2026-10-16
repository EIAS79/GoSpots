import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { PERMS_KEY } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { HardwareController } from './hardware.controller';
import { HardwareService } from './hardware.service';

describe('T-009 read-only cloud print incident review', () => {
  const actor = (shopId: string) => ({ shopId }) as JwtAccessPayload;
  function setup() {
    const findMany = jest
      .fn<Promise<unknown[]>, [Prisma.PrintJobFindManyArgs]>()
      .mockResolvedValue([]);
    const flags = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
    const prisma = { printJob: { findMany } };
    const service = new HardwareService(
      prisma as never,
      flags as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, flags, findMany };
  }

  it('restricts incident discovery to the authenticated venue', async () => {
    const { service, findMany } = setup();
    await service.listPrintIncidents(actor('shop-A'));
    expect(findMany.mock.calls[0][0].where).toMatchObject({ shopId: 'shop-A' });
  });

  it('never requests printable payloads during incident review', async () => {
    const { service, findMany } = setup();
    await service.listPrintIncidents(actor('shop-A'));
    const query = findMany.mock.calls[0][0];
    expect(query.select).toHaveProperty('printerDeviceId', true);
    expect(query.select).not.toHaveProperty('payload');
    expect(query.select).not.toHaveProperty('dedupeKey');
    expect(query.take).toBe(26);
  });

  it('does not touch write paths and refuses a missing venue', async () => {
    const { service, prisma, findMany } = setup();
    await service.listPrintIncidents(actor('shop-A'));
    expect(Object.keys(prisma.printJob)).toEqual(['findMany']);
    await expect(service.listPrintIncidents(actor(''))).rejects.toThrow(
      ForbiddenException,
    );
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('requires shop.manage on the read-only endpoint', () => {
    const handler = Object.getOwnPropertyDescriptor(
      HardwareController.prototype,
      'listPrintIncidents',
    )?.value as (...args: never[]) => unknown;
    expect(Reflect.getMetadata(PERMS_KEY, handler)).toEqual([
      PERMISSIONS.SHOP_MANAGE,
    ]);
    const context = (perms: string) =>
      ({
        getHandler: () => handler,
        getClass: () => HardwareController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { shopId: 'shop-A', perms } }),
        }),
      }) as never;
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(context(PERMISSIONS.SHOP_MANAGE))).toBe(true);
    expect(() =>
      guard.canActivate(context(PERMISSIONS.TRANSACTION_READ)),
    ).toThrow();
  });

  it('excludes successful work and ordinary preflight failures from review', async () => {
    const { service, findMany } = setup();
    await service.listPrintIncidents(actor('shop-A'));
    const query = findMany.mock.calls[0][0];
    expect(query.where?.status).toEqual({
      in: ['CLAIMED', 'PRINTING', 'FAILED'],
    });
    expect(query.where?.lastErrorCode).toEqual({
      in: ['EDGE_PRINT_OUTCOME_UNKNOWN', 'EDGE_PRINT_LEASE_EXPIRED'],
    });
  });

  it('blocks inspection when device registry is disabled', async () => {
    const { service, flags, findMany } = setup();
    flags.isFeatureEnabled.mockResolvedValue(false);
    await expect(service.listPrintIncidents(actor('shop-A'))).rejects.toThrow(
      ForbiddenException,
    );
    expect(findMany).not.toHaveBeenCalled();
  });
  it('rejects malformed and foreign-shop pagination cursors', async () => {
    const { service, findMany } = setup();
    await expect(
      service.listPrintIncidents(actor('shop-A'), '101'),
    ).rejects.toThrow();
    await expect(
      service.listPrintIncidents(actor('shop-A'), '25', '!bad!'),
    ).rejects.toThrow();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns a single unresolved print incident with no next page', async () => {
    const { service, findMany } = setup();
    const incident = {
      id: 'job-1',
      shopId: 'shop-A',
      createdAt: new Date('2026-10-15T00:00:00.000Z'),
    };
    findMany.mockResolvedValueOnce([incident]);
    const result = await service.listPrintIncidents(actor('shop-A'));
    expect(result).toEqual({
      items: [expect.objectContaining(incident)],
      hasMore: false,
      nextCursor: null,
    });
  });

  it('pages over 100 incidents, including identical timestamps, without duplicates', async () => {
    const { service, findMany } = setup();
    const rows = Array.from({ length: 137 }, (_, index) => ({
      id: `job-${String(index).padStart(4, '0')}`,
      shopId: 'shop-A',
      createdAt: new Date(
        index < 120 ? '2026-10-15T00:00:00.000Z' : '2026-10-16T00:00:00.000Z',
      ),
    }));
    findMany.mockImplementation((args) => {
      const where = args.where as {
        shopId: string;
        OR?: [
          { createdAt: { gt: Date } },
          { createdAt: Date; id: { gt: string } },
        ];
      };
      return Promise.resolve(
        rows
          .filter(
            (row) =>
              row.shopId === where.shopId &&
              (!where.OR ||
                row.createdAt > where.OR[0].createdAt.gt ||
                (row.createdAt.getTime() === where.OR[1].createdAt.getTime() &&
                  row.id > where.OR[1].id.gt)),
          )
          .slice(0, args.take),
      );
    });
    let cursor: string | undefined;
    const visited: string[] = [];
    for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
      const page = await service.listPrintIncidents(
        actor('shop-A'),
        '40',
        cursor,
      );
      visited.push(...page.items.map((row) => row.id));
      if (!page.hasMore) {
        expect(page.nextCursor).toBeNull();
        break;
      }
      expect(page.nextCursor).toEqual(expect.any(String));
      cursor = page.nextCursor ?? undefined;
    }
    expect(visited).toEqual(rows.map((row) => row.id));
    expect(new Set(visited).size).toBe(137);
    expect(findMany).toHaveBeenCalledTimes(4);
    expect(
      findMany.mock.calls.every(([query]) => query.where?.shopId === 'shop-A'),
    ).toBe(true);
    expect(findMany.mock.calls.every(([query]) => query.take === 41)).toBe(
      true,
    );
  });

  it('rejects oversized pages, malformed cursors and cursors from another venue', async () => {
    const { service, findMany } = setup();
    await expect(
      service.listPrintIncidents(actor('shop-A'), '101'),
    ).rejects.toThrow();
    await expect(
      service.listPrintIncidents(actor('shop-A'), '0'),
    ).rejects.toThrow();
    await expect(
      service.listPrintIncidents(actor('shop-A'), '12', '!bad!'),
    ).rejects.toThrow();
    const foreign = Buffer.from(
      JSON.stringify({
        v: 1,
        shopId: 'shop-B',
        id: 'job-1',
        createdAt: '2026-10-15T00:00:00.000Z',
      }),
    ).toString('base64url');
    await expect(
      service.listPrintIncidents(actor('shop-A'), '25', foreign),
    ).rejects.toThrow();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('a late original-Edge success falls out of the active incident filter; no physical action occurs', async () => {
    const { service, findMany, prisma } = setup();
    const before = await service.listPrintIncidents(actor('shop-A'));
    expect(before.items).toEqual([]);
    const filter = findMany.mock.calls[0][0].where;
    expect(filter?.status).toEqual({ in: ['CLAIMED', 'PRINTING', 'FAILED'] });
    expect(filter?.lastErrorCode).toEqual({
      in: ['EDGE_PRINT_OUTCOME_UNKNOWN', 'EDGE_PRINT_LEASE_EXPIRED'],
    });
    expect(Object.keys(prisma.printJob)).toEqual(['findMany']);
  });
});
