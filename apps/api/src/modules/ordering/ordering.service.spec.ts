import { calculateEffectiveOrderTotals } from './ordering.service';

describe('Ordering effective totals',()=>{
  it('excludes canceled immutable line snapshots from parent totals',()=>{
    const totals=calculateEffectiveOrderTotals([
      {taxMinor:230,totalMinor:1230,canceledAt:null},
      {taxMinor:115,totalMinor:615,canceledAt:new Date('2026-08-11T08:00:00Z')},
      {taxMinor:92,totalMinor:492,canceledAt:null},
    ]);
    expect(totals).toEqual({subtotalMinor:1400,taxMinor:322,totalMinor:1722});
  });
  it('returns zero effective totals when every line is canceled',()=>{
    expect(calculateEffectiveOrderTotals([{taxMinor:23,totalMinor:123,canceledAt:new Date()}])).toEqual({subtotalMinor:0,taxMinor:0,totalMinor:0});
  });
});
