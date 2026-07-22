import {
  OVERLAP_ACTIVE_STATUSES,
  RESERVATION_EXCLUSION_CONSTRAINT_SQL,
  RESERVATION_OVERLAP_DETECTION_SQL,
  listReservationOverlapPairs,
} from './reservation-overlap-detect.util';

describe('reservation-overlap-detect.util', () => {
  it('exclusion SQL uses gist + immutable tsrange + active status filter', () => {
    expect(RESERVATION_EXCLUSION_CONSTRAINT_SQL).toContain('btree_gist');
    expect(RESERVATION_EXCLUSION_CONSTRAINT_SQL).toContain('EXCLUDE USING gist');
    expect(RESERVATION_EXCLUSION_CONSTRAINT_SQL).toContain(
      "tsrange(\"startsAt\", \"endsAt\", '[)')",
    );
    expect(RESERVATION_EXCLUSION_CONSTRAINT_SQL).toContain('"resourceId" WITH =');
    for (const s of OVERLAP_ACTIVE_STATUSES) {
      expect(RESERVATION_EXCLUSION_CONSTRAINT_SQL).toContain(`'${s}'`);
    }
  });

  it('detection SQL is self-join with half-open ranges (read-only)', () => {
    expect(RESERVATION_OVERLAP_DETECTION_SQL).toContain('JOIN "Reservation" b');
    expect(RESERVATION_OVERLAP_DETECTION_SQL).toContain('a.id < b.id');
    expect(RESERVATION_OVERLAP_DETECTION_SQL).toContain(
      "tsrange(a.\"startsAt\", a.\"endsAt\", '[)')",
    );
    expect(RESERVATION_OVERLAP_DETECTION_SQL.toLowerCase()).not.toMatch(
      /\b(delete|update|insert|truncate|drop)\b/,
    );
  });

  it('listReservationOverlapPairs only runs the detection query', async () => {
    const pairs = [
      {
        aId: 'a',
        bId: 'b',
        shopId: 's',
        resourceId: 'r',
        aStartsAt: new Date('2026-07-20T10:00:00Z'),
        aEndsAt: new Date('2026-07-20T11:00:00Z'),
        aStatus: 'CONFIRMED',
        bStartsAt: new Date('2026-07-20T10:30:00Z'),
        bEndsAt: new Date('2026-07-20T11:30:00Z'),
        bStatus: 'PENDING',
      },
    ];
    const queryRawUnsafe = jest.fn().mockResolvedValue(pairs);
    const prisma = { $queryRawUnsafe: queryRawUnsafe };

    const result = await listReservationOverlapPairs(prisma as never);

    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(queryRawUnsafe.mock.calls[0][0]).toBe(
      RESERVATION_OVERLAP_DETECTION_SQL,
    );
    expect(result).toEqual(pairs);
  });
});
