import { NotFoundException } from '@nestjs/common';
import { GuestChatSender, GuestChatStatus } from '@prisma/client';
import { GuestChatService } from './guest-chat.service';

jest.mock('../../common/venue-entitlements', () => ({
  assertShopHasFeature: jest.fn().mockResolvedValue(undefined),
}));

describe('GuestChatService tenant-scoped mutations', () => {
  const audit = { record: jest.fn(), recordForShop: jest.fn() };
  const notifications = { recordTeamEvent: jest.fn() };

  const actor = {
    sub: 'user_1',
    shopId: 'shop_a',
    shopRole: 'OWNER',
    perms: '*',
  } as never;

  const now = new Date('2030-06-15T12:00:00.000Z');

  const ownedChat = {
    id: 'chat_1',
    shopId: 'shop_a',
    guestName: 'Alex Guest',
    guestEmail: 'alex@example.com',
    guestPhone: null,
    status: GuestChatStatus.WAITING,
    staffJoinedAt: null,
    staffUserId: null,
    lastGuestPingAt: null,
    endedAt: null,
    endedBy: null,
    createdAt: now,
    updatedAt: now,
    messages: [] as {
      id: string;
      sender: GuestChatSender;
      staffUserId: string | null;
      body: string;
      createdAt: Date;
    }[],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeService(prisma: Record<string, unknown>) {
    return new GuestChatService(
      prisma as never,
      notifications as never,
      audit as never,
    );
  }

  it('listForShop scopes findMany + count to actor shopId', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const service = makeService({
      guestChat: { findMany, count },
    });

    await service.listForShop(actor, {});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop_a' },
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: { shopId: 'shop_a' } });
    expect(count).toHaveBeenCalledWith({
      where: { shopId: 'shop_a', status: GuestChatStatus.WAITING },
    });
  });

  it('getForStaff uses shopId in findFirst where', async () => {
    const findFirst = jest.fn().mockResolvedValue(ownedChat);
    const service = makeService({
      guestChat: { findFirst },
    });

    await service.getForStaff(actor, 'chat_1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'chat_1', shopId: 'shop_a' },
      }),
    );
  });

  it('getForStaff rejects Shop B chat id for Shop A actor', async () => {
    const service = makeService({
      guestChat: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(
      service.getForStaff(actor, 'chat_shop_b'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('staffJoin uses shopId in findFirst + update where', async () => {
    const update = jest.fn().mockResolvedValue({
      ...ownedChat,
      status: GuestChatStatus.OPEN,
      staffJoinedAt: now,
      staffUserId: 'user_1',
    });
    const findFirst = jest.fn().mockResolvedValue(ownedChat);
    const service = makeService({
      guestChat: { findFirst, update },
    });

    await service.staffJoin(actor, 'chat_1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'chat_1', shopId: 'shop_a' },
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'chat_1', shopId: 'shop_a' },
      }),
    );
  });

  it('staffJoin rejects Shop B chat id for Shop A actor', async () => {
    const update = jest.fn();
    const service = makeService({
      guestChat: {
        findFirst: jest.fn().mockResolvedValue(null),
        update,
      },
    });

    await expect(service.staffJoin(actor, 'chat_shop_b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('staffSetStatus uses shopId in findFirst + update where', async () => {
    const openChat = { ...ownedChat, status: GuestChatStatus.OPEN };
    const update = jest.fn().mockResolvedValue({
      ...openChat,
      status: GuestChatStatus.ENDED,
      endedAt: now,
      endedBy: GuestChatSender.STAFF,
      messages: [],
    });
    const findFirst = jest.fn().mockResolvedValue(openChat);
    const service = makeService({
      guestChat: { findFirst, update },
    });

    await service.staffSetStatus(actor, 'chat_1', GuestChatStatus.ENDED);

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'chat_1', shopId: 'shop_a' },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'chat_1', shopId: 'shop_a' },
      }),
    );
  });

  it('staffSetStatus rejects Shop B chat id for Shop A actor', async () => {
    const update = jest.fn();
    const service = makeService({
      guestChat: {
        findFirst: jest.fn().mockResolvedValue(null),
        update,
      },
    });

    await expect(
      service.staffSetStatus(actor, 'chat_shop_b', GuestChatStatus.ENDED),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('staffSendMessage uses shopId in findFirst + update where', async () => {
    const openChat = { ...ownedChat, status: GuestChatStatus.OPEN };
    const findFirst = jest.fn().mockResolvedValue(openChat);
    const update = jest.fn().mockResolvedValue(openChat);
    const create = jest.fn().mockResolvedValue({
      id: 'msg_1',
      sender: GuestChatSender.STAFF,
      staffUserId: 'user_1',
      body: 'Hello',
      createdAt: now,
    });
    const service = makeService({
      guestChat: { findFirst, update },
      guestChatMessage: { create },
    });

    await service.staffSendMessage(actor, 'chat_1', 'Hello');

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'chat_1', shopId: 'shop_a' },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'chat_1', shopId: 'shop_a' },
      }),
    );
    expect(create).toHaveBeenCalled();
  });

  it('staffSendMessage rejects Shop B chat id for Shop A actor', async () => {
    const create = jest.fn();
    const update = jest.fn();
    const service = makeService({
      guestChat: {
        findFirst: jest.fn().mockResolvedValue(null),
        update,
      },
      guestChatMessage: { create },
    });

    await expect(
      service.staffSendMessage(actor, 'chat_shop_b', 'Hijack'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('staffDelete uses shopId in findFirst + delete where', async () => {
    const del = jest.fn().mockResolvedValue(ownedChat);
    const findFirst = jest.fn().mockResolvedValue(ownedChat);
    const service = makeService({
      guestChat: { findFirst, delete: del },
    });

    await service.staffDelete(actor, 'chat_1');

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'chat_1', shopId: 'shop_a' },
    });
    expect(del).toHaveBeenCalledWith({
      where: { id: 'chat_1', shopId: 'shop_a' },
    });
  });

  it('staffDelete rejects Shop B chat id for Shop A actor', async () => {
    const del = jest.fn();
    const service = makeService({
      guestChat: {
        findFirst: jest.fn().mockResolvedValue(null),
        delete: del,
      },
    });

    await expect(
      service.staffDelete(actor, 'chat_shop_b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(del).not.toHaveBeenCalled();
  });
});
