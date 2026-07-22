import { computeGuestCheckRunningTotal } from './guest-check-total.util';

describe('computeGuestCheckRunningTotal', () => {
  it('sums menu order + walk-in play', () => {
    const r = computeGuestCheckRunningTotal({
      orders: [{ id: 'o1', status: 'PENDING', total: '12.5000', label: 'Table 3' }],
      playSessions: [
        {
          id: 'p1',
          status: 'ACTIVE',
          amount: '20.0000',
          reservationId: null,
          label: 'Pool',
        },
      ],
      reservations: [],
    });
    expect(r.runningTotal).toBe('32.5000');
    expect(r.menuTotal).toBe('12.5000');
    expect(r.playTotal).toBe('20.0000');
    expect(r.lines.filter((l) => !l.excluded)).toHaveLength(2);
  });

  it('excludes linked play when reservation is billed (no double-count)', () => {
    const r = computeGuestCheckRunningTotal({
      orders: [],
      playSessions: [
        {
          id: 'p1',
          status: 'COMPLETED',
          amount: '99.0000',
          reservationId: 'res_1',
          label: 'Linked',
        },
      ],
      reservations: [
        {
          id: 'res_1',
          guestName: 'Ada',
          billedAmount: '40.0000',
          resourceId: 'resu_1',
        },
      ],
    });
    expect(r.runningTotal).toBe('40.0000');
    expect(r.playTotal).toBe('0.0000');
    expect(r.reservationTotal).toBe('40.0000');
    const excluded = r.lines.find((l) => l.sourceId === 'p1');
    expect(excluded?.excluded).toBe(true);
    expect(excluded?.reason).toBe('linked_play_excluded_bill_on_reservation');
  });

  it('excludes linked play even when reservation is not on the check', () => {
    const r = computeGuestCheckRunningTotal({
      orders: [],
      playSessions: [
        {
          id: 'p1',
          status: 'COMPLETED',
          amount: '50.0000',
          reservationId: 'res_other',
        },
      ],
      reservations: [],
    });
    expect(r.runningTotal).toBe('0.0000');
    expect(r.lines[0]?.excluded).toBe(true);
    expect(r.lines[0]?.reason).toBe(
      'linked_play_excluded_even_if_reservation_not_on_check',
    );
  });

  it('does not add reservationFee again on top of order total', () => {
    const r = computeGuestCheckRunningTotal({
      orders: [
        {
          id: 'o1',
          status: 'COMPLETED',
          total: '35.0000',
          reservationFee: '5.0000',
          label: 'Dinner',
        },
      ],
      playSessions: [],
      reservations: [],
    });
    expect(r.runningTotal).toBe('35.0000');
    expect(r.lines[0]?.reason).toBe('reservationFee_embedded_in_order_total');
  });

  it('ignores canceled orders and play sessions', () => {
    const r = computeGuestCheckRunningTotal({
      orders: [
        { id: 'o1', status: 'CANCELED', total: '100.0000' },
        { id: 'o2', status: 'PENDING', total: '10.0000' },
      ],
      playSessions: [
        {
          id: 'p1',
          status: 'CANCELED',
          amount: '80.0000',
          reservationId: null,
        },
      ],
      reservations: [],
    });
    expect(r.runningTotal).toBe('10.0000');
  });

  it('counts unbilled reservation as zero contribution', () => {
    const r = computeGuestCheckRunningTotal({
      orders: [],
      playSessions: [],
      reservations: [{ id: 'res_1', guestName: 'Bob', billedAmount: null }],
    });
    expect(r.runningTotal).toBe('0.0000');
    expect(r.lines[0]?.reason).toBe('unbilled');
  });
});
