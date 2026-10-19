import { PrismaService } from '../../prisma/prisma.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import { AuditService } from '../audit/audit.service';
import { EdgeHubService } from '../edge-hub/edge-hub.service';
import { PrintJobStatus } from '@prisma/client';
import { HardwareRecoveryService } from './hardware-recovery.service';
import { HardwareService } from './hardware.service';
import { attachPrintIncidentTransactionMock } from './print-incident-transaction.mock';

const EMPTY_HEADERS = {} as Record<string, string | string[] | undefined>;

describe('W2 cross-device print-lease safety (isolated backend and simulated printers)', () => {
  for (const cloudPrintingAcknowledged of [true, false]) {
    it(`never offers a potentially printed job to a fresh Edge B (cloud PRINTING ack=${cloudPrintingAcknowledged})`, async () => {
      let activeDevice = 'edge-A';
      let activeShop = 'shop-1';
      const printEffects: string[] = [];
      const job = {
        id: 'job-1', shopId: 'shop-1', status: PrintJobStatus.QUEUED,
        printerDeviceId: 'printer-1', createdAt: new Date(0),
        claimedByEdgeDeviceId: null as string | null,
        claimedAt: null as Date | null,
        printingAt: null as Date | null,
        attemptCount: 0, maxAttempts: 5,
        lastErrorCode: null as string | null,
        lastError: null as string | null,
        type: 'CUSTOMER_RECEIPT', payload: { text: 'one receipt' },
        sourceType: 'GuestCheck', sourceId: 'check-1',
      };
      const safeQueued = { ...job, id: 'safe-queued-job', sourceId: 'check-other',
        payload: { text: 'unrelated safe receipt' } };
      const jobs = [job, safeQueued];
      const matches = (where: Record<string, unknown>, row = job): boolean =>
        Object.entries(where).every(([key, target]) => {
          const current = (row as unknown as Record<string, unknown>)[key];
          if (key === 'OR' && Array.isArray(target))
            return target.some((item: unknown) => matches(item as Record<string, unknown>, row));
          if (target && typeof target === 'object' && !(target instanceof Date)) {
            if ('in' in target && Array.isArray(target.in)) return target.in.includes(current);
            if ('lt' in target && target.lt instanceof Date) return current instanceof Date && current.getTime() < target.lt.getTime();
            if ('lt' in target && typeof target.lt === 'number') return typeof current === 'number' && current < target.lt;
            if ('not' in target) return current !== target.not;
          }
          return current instanceof Date && target instanceof Date
            ? current.getTime() === target.getTime()
            : current === target;
        });
      const printJob = {
        findMany: jest.fn(({ where }: { where: Record<string, unknown> }) => jobs.filter((row) => matches(where, row)).map((row) => ({ ...row }))),
        findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
          const selected = jobs.find((row) => matches(where, row));
          return selected ? { ...selected } : null;
        }),
        findUnique: jest.fn(({ where }: { where: Record<string, unknown> }) => {
          const selected = jobs.find((row) => matches(where, row));
          return selected ? { ...selected } : null;
        }),
        update: jest.fn(({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const selected = jobs.find((row) => matches(where, row));
          if (!selected) throw new Error('Simulated missing print job');
          Object.assign(selected, data);
          return { ...selected };
        }),
        updateMany: jest.fn(({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const selected = jobs.find((row) => matches(where, row));
          if (!selected) return { count: 0 };
          for (const [key, value] of Object.entries(data)) {
            const writable = selected as unknown as Record<string, unknown>;
            writable[key] = value && typeof value === 'object' && 'increment' in value &&
              typeof value.increment === 'number' && typeof writable[key] === 'number'
              ? writable[key] + value.increment : value;
          }
          return { count: 1 };
        }),
      };
      const prisma = { printJob, printerDeviceConfiguration: {
        findUnique: jest.fn(() => ({
          deviceId: 'printer-1', adapter: 'test', host: null, port: null,
          paperWidthMm: 80, capabilities: null,
        })),
      } };
      attachPrintIncidentTransactionMock(prisma);
      const edge = {
        authenticateSignedRequest: jest.fn(() => ({
          device: { id: activeDevice, shopId: activeShop },
        })),
      };
      const service = new HardwareService(
        prisma as unknown as PrismaService,
        { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as unknown as FeatureFlagService,
        { record: jest.fn() } as unknown as AuditService,
        edge as unknown as EdgeHubService,
      );
      const recovery = new HardwareRecoveryService(prisma as unknown as PrismaService);

      // Each simulated Edge has a separate journal. A has its print outcome
      // quarantined locally, which B never sees.
      const journalA = new Map([['job-1', 'DISPATCH_UNCERTAIN']]);
      const journalB = new Map<string, string>();
      const claimedByA = await service.edgeClaim(EMPTY_HEADERS);
      expect(claimedByA.job?.id).toBe('job-1');
      if (cloudPrintingAcknowledged) {
        await service.edgeMarkPrinting(EMPTY_HEADERS, 'job-1');
      }
      printEffects.push('edge-A');
      expect(journalA.get('job-1')).toBe('DISPATCH_UNCERTAIN');
      job.claimedAt = new Date(Date.now() - 20 * 60_000);
      activeDevice = 'edge-B';

      const result = await recovery.recoverStaleClaims();
      // Quarantined jobs must stop consuming every recovery batch.
      expect((await recovery.recoverStaleClaims()).scanned).toBe(0);
      activeShop = 'foreign-shop';
      expect((await service.edgeClaim(EMPTY_HEADERS)).job).toBeNull();
      activeShop = 'shop-1';
      const claimedByB = await service.edgeClaim(EMPTY_HEADERS);
      if (claimedByB.job) {
        journalB.set(claimedByB.job.id, 'DISPATCH_UNCERTAIN');
        printEffects.push(claimedByB.job.id === 'job-1' ? 'edge-B-DUPLICATE' : 'edge-B-safe');
      }
      expect(claimedByB.job?.id).toBe('safe-queued-job');
      expect(printEffects).toEqual(['edge-A', 'edge-B-safe']);
      expect(journalB.has('job-1')).toBe(false);
      expect(journalB.has('safe-queued-job')).toBe(true);
      expect(job.lastErrorCode).toBe('EDGE_PRINT_OUTCOME_UNKNOWN');
      expect(job.claimedByEdgeDeviceId).toBe('edge-A');
      expect(result.requeued).toBe(0);
      activeDevice = 'edge-A';
      const originalAck = await service.edgeComplete(EMPTY_HEADERS, 'job-1', { status: PrintJobStatus.SUCCEEDED });
      expect(originalAck.status).toBe(PrintJobStatus.SUCCEEDED);
      expect(job.status).toBe(PrintJobStatus.SUCCEEDED);
      expect(job.lastErrorCode).toBeNull();
    });
  }
});
