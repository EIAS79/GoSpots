import {
  GUEST_PLAINTEXT_WITH_HASH_WHERE,
  clearLeftoverGuestPlaintext,
  countLeftoverGuestPlaintext,
} from './guest-plaintext-clear.util';

function mockDb(counts: {
  reservation: number;
  eventRequest: number;
  guestChat: number;
}) {
  return {
    reservation: {
      count: jest.fn().mockResolvedValue(counts.reservation),
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: counts.reservation }),
    },
    eventRequest: {
      count: jest.fn().mockResolvedValue(counts.eventRequest),
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: counts.eventRequest }),
    },
    guestChat: {
      count: jest.fn().mockResolvedValue(counts.guestChat),
      updateMany: jest.fn().mockResolvedValue({ count: counts.guestChat }),
    },
  };
}

describe('guest-plaintext-clear.util', () => {
  it('where clause requires both plaintext and hash', () => {
    expect(GUEST_PLAINTEXT_WITH_HASH_WHERE).toEqual({
      guestToken: { not: null },
      guestTokenHash: { not: null },
    });
  });

  it('countLeftoverGuestPlaintext sums three tables', async () => {
    const db = mockDb({ reservation: 2, eventRequest: 1, guestChat: 3 });
    const counted = await countLeftoverGuestPlaintext(db as never);

    expect(counted).toEqual({
      reservation: 2,
      eventRequest: 1,
      guestChat: 3,
      total: 6,
    });
    expect(db.reservation.count).toHaveBeenCalledWith({
      where: GUEST_PLAINTEXT_WITH_HASH_WHERE,
    });
    expect(db.eventRequest.count).toHaveBeenCalledWith({
      where: GUEST_PLAINTEXT_WITH_HASH_WHERE,
    });
    expect(db.guestChat.count).toHaveBeenCalledWith({
      where: GUEST_PLAINTEXT_WITH_HASH_WHERE,
    });
    expect(db.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('clearLeftoverGuestPlaintext defaults to dry-run (no writes)', async () => {
    const db = mockDb({ reservation: 4, eventRequest: 0, guestChat: 1 });
    const result = await clearLeftoverGuestPlaintext(db as never);

    expect(result).toEqual({
      dryRun: true,
      counted: {
        reservation: 4,
        eventRequest: 0,
        guestChat: 1,
        total: 5,
      },
    });
    expect(db.reservation.updateMany).not.toHaveBeenCalled();
    expect(db.eventRequest.updateMany).not.toHaveBeenCalled();
    expect(db.guestChat.updateMany).not.toHaveBeenCalled();
  });

  it('explicit dryRun:true never writes even if apply is true', async () => {
    const db = mockDb({ reservation: 1, eventRequest: 0, guestChat: 0 });
    const result = await clearLeftoverGuestPlaintext(db as never, {
      dryRun: true,
      apply: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.cleared).toBeUndefined();
    expect(db.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('apply clears plaintext only with hash where clause', async () => {
    const db = mockDb({ reservation: 2, eventRequest: 3, guestChat: 1 });
    const result = await clearLeftoverGuestPlaintext(db as never, {
      apply: true,
      dryRun: false,
    });

    expect(result).toEqual({
      dryRun: false,
      counted: {
        reservation: 2,
        eventRequest: 3,
        guestChat: 1,
        total: 6,
      },
      cleared: {
        reservation: 2,
        eventRequest: 3,
        guestChat: 1,
        total: 6,
      },
    });

    const expectedUpdate = {
      where: GUEST_PLAINTEXT_WITH_HASH_WHERE,
      data: { guestToken: null },
    };
    expect(db.reservation.updateMany).toHaveBeenCalledWith(expectedUpdate);
    expect(db.eventRequest.updateMany).toHaveBeenCalledWith(expectedUpdate);
    expect(db.guestChat.updateMany).toHaveBeenCalledWith(expectedUpdate);
  });

  it('apply:true alone (no dryRun) performs writes', async () => {
    const db = mockDb({ reservation: 0, eventRequest: 0, guestChat: 0 });
    const result = await clearLeftoverGuestPlaintext(db as never, {
      apply: true,
    });
    expect(result.dryRun).toBe(false);
    expect(db.reservation.updateMany).toHaveBeenCalled();
  });
});
