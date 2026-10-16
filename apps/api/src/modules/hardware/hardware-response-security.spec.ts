import { Reflector } from '@nestjs/core';
import { PERMISSIONS } from '../../common/permissions';
import { PERMS_KEY } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { HardwareController } from './hardware.controller';
import { HardwareService } from './hardware.service';
import {
  safePrintDiagnostic,
  safePrinterDiagnostic,
} from './hardware-response-safety';
import { Prisma } from '@prisma/client';
import type { JwtAccessPayload } from '../auth/auth.service';

describe('T-009 P0 hardware response safety', () => {
  const actor = (shopId: string) => ({ shopId }) as JwtAccessPayload;

  function setup() {
    const prisma = {
      printJob: {
        findMany: jest
          .fn<Promise<unknown[]>, [Prisma.PrintJobFindManyArgs]>()
          .mockResolvedValue([]),
      },
      printerDeviceConfiguration: {
        findMany: jest
          .fn<
            Promise<unknown[]>,
            [Prisma.PrinterDeviceConfigurationFindManyArgs]
          >()
          .mockResolvedValue([]),
      },
      printRoute: {
        findMany: jest
          .fn<Promise<unknown[]>, [Prisma.PrintRouteFindManyArgs]>()
          .mockResolvedValue([]),
      },
      customerDisplayBinding: {
        findMany: jest
          .fn<Promise<unknown[]>, [Prisma.CustomerDisplayBindingFindManyArgs]>()
          .mockResolvedValue([]),
      },
      barcodeAlias: {
        count: jest
          .fn<Promise<number>, [Prisma.BarcodeAliasCountArgs]>()
          .mockResolvedValue(0),
      },
    };
    const flags = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
    return {
      prisma,
      flags,
      service: new HardwareService(
        prisma as never,
        flags as never,
        {} as never,
        {} as never,
      ),
    };
  }

  const forbidden = [
    'payload',
    'dedupeKey',
    'fiscalSemanticKey',
    'createdById',
    'routeId',
  ];

  it('scopes every overview collection to the authenticated venue', async () => {
    const { service, prisma, flags } = setup();
    await service.overview(actor('shop-A'));
    for (const finder of [
      prisma.printJob.findMany,
      prisma.printerDeviceConfiguration.findMany,
      prisma.printRoute.findMany,
      prisma.customerDisplayBinding.findMany,
      prisma.barcodeAlias.count,
    ]) {
      expect(finder).toHaveBeenCalledWith(
        expect.objectContaining({ where: { shopId: 'shop-A' } }),
      );
    }
    expect(flags.isFeatureEnabled).toHaveBeenCalledWith(
      'shop-A',
      'device_registry',
    );
  });

  it('selects only the existing UI print-job fields; never selects printable or fiscal data', async () => {
    const { service, prisma } = setup();
    await service.overview(actor('shop-A'));
    const args = prisma.printJob.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ where: { shopId: 'shop-A' }, take: 50 });
    expect(Object.keys(args.select ?? {}).sort()).toEqual(
      [
        'id',
        'type',
        'sourceType',
        'sourceId',
        'status',
        'attemptCount',
        'maxAttempts',
        'claimedAt',
        'createdAt',
        'lastErrorCode',
        'lastError',
      ].sort(),
    );
    for (const field of forbidden)
      expect(args.select).not.toHaveProperty(field);
    expect(
      prisma.printerDeviceConfiguration.findMany.mock.calls[0][0].select,
    ).not.toHaveProperty('capabilities');
    expect(
      prisma.customerDisplayBinding.findMany.mock.calls[0][0].select,
    ).not.toHaveProperty('displayTokenHash');
    expect(
      prisma.customerDisplayBinding.findMany.mock.calls[0][0].select,
    ).not.toHaveProperty('snapshot');
  });

  it('constructs a strict response even if a query mock accidentally contains secret fields', async () => {
    const { service, prisma } = setup();
    prisma.printJob.findMany.mockResolvedValueOnce([
      {
        id: 'job-1',
        type: 'CUSTOMER_RECEIPT',
        sourceType: 'check',
        sourceId: 'check-1',
        status: 'FAILED',
        attemptCount: 1,
        maxAttempts: 5,
        claimedAt: null,
        createdAt: new Date('2026-10-15T00:00:00Z'),
        lastErrorCode: 'UNSUPPORTED_PRINTER_ADAPTER',
        lastError: 'postgres://user:pass@host/db?token=supersecret',
        payload: { customerEmail: 'person@example.com' },
        dedupeKey: 'private-dedupe',
        fiscalSemanticKey: 'private-fiscal',
        createdById: 'private-person',
        routeId: 'private-route',
      },
    ]);
    prisma.printerDeviceConfiguration.findMany.mockResolvedValueOnce([
      {
        deviceId: 'printer-1',
        adapter: 'tcp-escpos',
        host: '192.0.2.10',
        port: 9100,
        paperWidthMm: 80,
        enabled: true,
        lastError: 'Bearer abc.secret',
        capabilities: { password: 'printer-secret' },
      },
    ]);
    const result = await service.overview(actor('shop-A'));
    const job = result.recentJobs[0];
    expect(job).toMatchObject({
      id: 'job-1',
      type: 'CUSTOMER_RECEIPT',
      sourceType: 'check',
      sourceId: 'check-1',
      status: 'FAILED',
      attemptCount: 1,
      maxAttempts: 5,
      lastErrorCode: 'UNSUPPORTED_PRINTER_ADAPTER',
    });
    for (const field of forbidden) expect(job).not.toHaveProperty(field);
    expect(JSON.stringify(result)).not.toMatch(
      /supersecret|person@example.com|private-fiscal|private-dedupe|printer-secret|Bearer/,
    );
    expect(result.printers[0]).toMatchObject({
      deviceId: 'printer-1',
      port: 9100,
    });
    expect(result.printers[0]).not.toHaveProperty('capabilities');
  });

  it.each([
    ['password=abc123', 'PRINT_ERROR_REVIEW'],
    ['Bearer eyJhbGciOiJIUzI1NiJ9.secret', 'PRINT_ERROR_REVIEW'],
    [
      'https://printer.local/status?api_key=abc&token=def',
      'PRINT_ERROR_REVIEW',
    ],
    ['person@example.com phone +48 501 234 567', 'PRINT_ERROR_REVIEW'],
    ['customer Alice Smith address 12 Sample Street', 'PRINT_ERROR_REVIEW'],
  ])(
    'never echoes sensitive diagnostic input: %s',
    (upstream, expectedCode) => {
      const result = safePrintDiagnostic('UPSTREAM_' + upstream, upstream);
      expect(result.lastErrorCode).toBe(expectedCode);
      expect(result.lastError).toBe(
        'Printer operation failed. Review the device configuration with an administrator.',
      );
      expect(JSON.stringify(result)).not.toContain(upstream);
      expect(safePrinterDiagnostic(upstream)).not.toContain(upstream);
    },
  );

  it('preserves meaningful approved uncertainty and preflight codes without raw text', () => {
    for (const code of [
      'EDGE_PRINT_OUTCOME_UNKNOWN',
      'EDGE_PRINT_LEASE_EXPIRED',
    ]) {
      const result = safePrintDiagnostic(code, 'token=private');
      expect(result.lastErrorCode).toBe(code);
      expect(result.lastError).toMatch(/uncertain/);
      expect(result.lastError).not.toContain('private');
    }
    expect(
      safePrintDiagnostic('UNSUPPORTED_PRINTER_ADAPTER', 'customer@example.com')
        .lastError,
    ).toMatch(/unsupported/);
    expect(safePrintDiagnostic(null, null)).toEqual({
      lastError: null,
      lastErrorCode: null,
    });
  });

  it('keeps incident records metadata-only even if the query mock supplies payloads', async () => {
    const { service, prisma } = setup();
    prisma.printJob.findMany.mockResolvedValueOnce([
      {
        id: 'job-2',
        shopId: 'shop-A',
        type: 'INVOICE',
        status: 'PRINTING',
        sourceType: 'invoice',
        sourceId: 'invoice-2',
        printerDeviceId: 'printer-1',
        claimedByEdgeDeviceId: 'edge-1',
        claimedAt: new Date('2026-10-15T00:00:00Z'),
        printingAt: null,
        printedAt: null,
        attemptCount: 1,
        createdAt: new Date('2026-10-15T00:00:00Z'),
        updatedAt: new Date('2026-10-15T00:00:00Z'),
        lastErrorCode: 'EDGE_PRINT_OUTCOME_UNKNOWN',
        lastError: 'https://example.org/?secret=private',
        payload: { email: 'victim@example.com' },
        dedupeKey: 'private-dedupe',
        fiscalSemanticKey: 'private-fiscal',
      },
    ]);
    const result = await service.listPrintIncidents(actor('shop-A'));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'job-2',
      shopId: 'shop-A',
      status: 'PRINTING',
      printerDeviceId: 'printer-1',
      claimedByEdgeDeviceId: 'edge-1',
      lastErrorCode: 'EDGE_PRINT_OUTCOME_UNKNOWN',
    });
    expect(result.hasMore).toBe(false);
    for (const field of forbidden)
      expect(result.items[0]).not.toHaveProperty(field);
    expect(JSON.stringify(result)).not.toMatch(/private|victim@example.com/);
    expect(prisma.printJob.findMany.mock.calls[0][0].where).toMatchObject({
      shopId: 'shop-A',
    });
    expect(Object.keys(prisma.printJob)).toEqual(['findMany']);
  });

  it('retains shop.manage for both overview and incidents and denies lesser roles', () => {
    const guard = new RolesGuard(new Reflector());
    for (const method of ['overview', 'listPrintIncidents'] as const) {
      const handler = Object.getOwnPropertyDescriptor(
        HardwareController.prototype,
        method,
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
      expect(guard.canActivate(context(PERMISSIONS.SHOP_MANAGE))).toBe(true);
      expect(() =>
        guard.canActivate(context(PERMISSIONS.TRANSACTION_READ)),
      ).toThrow();
    }
  });

  it('does not alter authorization or mutation behavior', async () => {
    const { service, prisma } = setup();
    await expect(service.overview(actor(''))).rejects.toThrow();
    await expect(service.listPrintIncidents(actor(''))).rejects.toThrow();
    expect(prisma.printJob.findMany).not.toHaveBeenCalled();
  });
});
