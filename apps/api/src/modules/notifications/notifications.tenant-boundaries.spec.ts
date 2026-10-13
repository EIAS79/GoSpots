import { NotificationsService } from './notifications.service';
import { NotificationsSseHub } from './notifications-sse.hub';
import type { JwtAccessPayload } from '../auth/auth.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

const owner = {
  sub: 'user-a',
  shopId: 'shop-a',
  shopRole: 'OWNER',
  perms: '*',
} as JwtAccessPayload;

function harness() {
  const notification = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    deleteMany: jest.fn(),
  };
  const auditRecord = jest.fn();
  const hub = new NotificationsSseHub();
  const service = new NotificationsService(
    { notification } as unknown as PrismaService,
    { record: auditRecord } as unknown as AuditService,
    hub,
  );
  return { notification, auditRecord, hub, service };
}

describe('notification SSE/export/admin tenant boundary', () => {
  it('never streams another shop or another user targeted notification', () => {
    const { hub } = harness();
    const seen: string[] = [];
    const subscription = hub
      .forActor('shop-a', 'user-a')
      .subscribe((event) => seen.push(event.id));
    const event = {
      shopId: 'shop-a',
      userId: null,
      id: 'a',
      section: 'operations',
      title: 'title',
      body: 'body',
      href: '/sessions',
      createdAt: new Date().toISOString(),
    };
    hub.publish(event);
    hub.publish({ ...event, shopId: 'shop-b', id: 'foreign-shop' });
    hub.publish({ ...event, userId: 'user-b', id: 'foreign-user' });
    hub.publish({ ...event, userId: 'user-a', id: 'targeted-owner' });
    subscription.unsubscribe();
    expect(seen).toEqual(['a', 'targeted-owner']);
  });

  it('scopes CSV export by shop and actor and denies unprivileged access', async () => {
    const h = harness();
    await h.service.exportCsv(owner);
    const firstQuery = h.notification.findMany.mock.calls[0] as [
      {
        where: {
          shopId: string;
          OR: Array<{ userId: string | null }>;
          archivedAt: Date | null;
        };
        take: number;
      },
    ];
    expect(firstQuery[0].where).toMatchObject({
      shopId: 'shop-a',
      OR: [{ userId: null }, { userId: 'user-a' }],
      archivedAt: null,
    });
    expect(firstQuery[0].take).toBe(10_000);
    await expect(
      h.service.exportCsv({
        ...owner,
        shopRole: 'STAFF',
        perms: '',
      }),
    ).rejects.toThrow(/Missing notifications.read/);
    expect(h.notification.findMany).toHaveBeenCalledTimes(1);
  });

  it('rejects foreign notification ID without mutation even for owner', async () => {
    const h = harness();
    await expect(h.service.markRead(owner, 'foreign-id')).rejects.toThrow(
      'Notification not found',
    );
    expect(h.notification.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-id',
        shopId: 'shop-a',
        OR: [{ userId: null }, { userId: 'user-a' }],
      },
    });
    expect(h.notification.update).not.toHaveBeenCalled();
  });

  it('blocks staff destructive admin action before any database or audit side effect', async () => {
    const h = harness();
    await expect(
      h.service.removeMany(
        { ...owner, shopRole: 'STAFF', perms: '' },
        { ids: ['foreign-id'] },
      ),
    ).rejects.toThrow(/Only the venue owner/);
    expect(h.notification.deleteMany).not.toHaveBeenCalled();
    expect(h.auditRecord).not.toHaveBeenCalled();
  });
});
