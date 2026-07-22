import { MailOutboxRetentionProcessor } from './mail-outbox-retention.processor';
import { MailOutboxService } from './mail-outbox.service';

describe('MailOutboxRetentionProcessor', () => {
  it('runRetentionPass delegates to MailOutboxService.purgeSentRows', async () => {
    const outbox = {
      purgeSentRows: jest.fn().mockResolvedValue({
        deleted: 3,
        cutoff: '2026-04-23T00:00:00.000Z',
      }),
    };
    const processor = new MailOutboxRetentionProcessor(
      {} as never,
      { get: jest.fn() } as never,
      outbox as unknown as MailOutboxService,
    );

    const now = new Date('2026-07-22T00:00:00.000Z');
    const result = await processor.runRetentionPass(90, now);

    expect(result.deleted).toBe(3);
    expect(outbox.purgeSentRows).toHaveBeenCalledWith({
      olderThanDays: 90,
      now,
    });
  });
});
