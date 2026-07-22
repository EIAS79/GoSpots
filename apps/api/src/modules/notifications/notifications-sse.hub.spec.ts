import { firstValueFrom, take } from 'rxjs';
import { NotificationsSseHub } from './notifications-sse.hub';

describe('NotificationsSseHub', () => {
  it('filters by shop and user (shop-wide + targeted)', async () => {
    const hub = new NotificationsSseHub();
    const got = firstValueFrom(hub.forActor('shop_a', 'user_1').pipe(take(1)));

    hub.publish({
      shopId: 'shop_b',
      userId: null,
      id: 'other',
      section: 'system',
      title: 'x',
      body: 'y',
      href: null,
      createdAt: new Date().toISOString(),
    });
    hub.publish({
      shopId: 'shop_a',
      userId: 'user_2',
      id: 'targeted-other',
      section: 'system',
      title: 'x',
      body: 'y',
      href: null,
      createdAt: new Date().toISOString(),
    });
    hub.publish({
      shopId: 'shop_a',
      userId: null,
      id: 'shop-wide',
      section: 'reservation',
      title: 'New booking',
      body: 'Table 2',
      href: '/sessions',
      createdAt: new Date().toISOString(),
    });

    await expect(got).resolves.toMatchObject({
      id: 'shop-wide',
      shopId: 'shop_a',
      userId: null,
    });
  });

  it('delivers user-targeted notifications to that user', async () => {
    const hub = new NotificationsSseHub();
    const got = firstValueFrom(hub.forActor('shop_a', 'user_1').pipe(take(1)));

    hub.publish({
      shopId: 'shop_a',
      userId: 'user_1',
      id: 'mine',
      section: 'staff',
      title: 'Hi',
      body: 'body',
      href: null,
      createdAt: new Date().toISOString(),
    });

    await expect(got).resolves.toMatchObject({ id: 'mine', userId: 'user_1' });
  });
});
