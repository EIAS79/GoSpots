import {
  isAdvisoryDiningMirrorRow,
  isSeatingMirrorManualOverrideEnabled,
  shouldDenyManualSeatingMutation,
} from './resource-dining-seating-guard.util';

describe('resource-dining-seating-guard.util', () => {
  const prev = process.env.SEATING_MIRROR_MANUAL_OVERRIDE;

  afterEach(() => {
    if (prev === undefined) delete process.env.SEATING_MIRROR_MANUAL_OVERRIDE;
    else process.env.SEATING_MIRROR_MANUAL_OVERRIDE = prev;
  });

  it('isAdvisoryDiningMirrorRow identifies linked non-custom rows', () => {
    expect(
      isAdvisoryDiningMirrorRow({
        isCustom: false,
        sourceDiningTableGroupId: 'dtg_1',
      }),
    ).toBe(true);
    expect(
      isAdvisoryDiningMirrorRow({
        isCustom: true,
        sourceDiningTableGroupId: 'dtg_1',
      }),
    ).toBe(false);
    expect(
      isAdvisoryDiningMirrorRow({
        isCustom: false,
        sourceDiningTableGroupId: null,
      }),
    ).toBe(false);
  });

  it('denies non-custom create/update when shop has DINING layout', () => {
    delete process.env.SEATING_MIRROR_MANUAL_OVERRIDE;
    expect(
      shouldDenyManualSeatingMutation({
        row: { isCustom: false, sourceDiningTableGroupId: null },
        shopHasDiningLayout: true,
      }),
    ).toBe(true);
  });

  it('denies manual edit of linked advisory mirror regardless of layout flag', () => {
    expect(
      shouldDenyManualSeatingMutation({
        row: { isCustom: false, sourceDiningTableGroupId: 'dtg_1' },
        shopHasDiningLayout: false,
      }),
    ).toBe(true);
  });

  it('allows isCustom event floor blocks', () => {
    expect(
      shouldDenyManualSeatingMutation({
        row: { isCustom: true, sourceDiningTableGroupId: null },
        shopHasDiningLayout: true,
      }),
    ).toBe(false);
  });

  it('allows non-custom lounge counters when shop has no DINING layout', () => {
    expect(
      shouldDenyManualSeatingMutation({
        row: { isCustom: false, sourceDiningTableGroupId: null },
        shopHasDiningLayout: false,
      }),
    ).toBe(false);
  });

  it('honors SEATING_MIRROR_MANUAL_OVERRIDE env', () => {
    delete process.env.SEATING_MIRROR_MANUAL_OVERRIDE;
    expect(isSeatingMirrorManualOverrideEnabled()).toBe(false);

    process.env.SEATING_MIRROR_MANUAL_OVERRIDE = 'on';
    expect(isSeatingMirrorManualOverrideEnabled()).toBe(true);
    expect(
      shouldDenyManualSeatingMutation({
        row: { isCustom: false, sourceDiningTableGroupId: 'dtg_1' },
        shopHasDiningLayout: true,
      }),
    ).toBe(false);
  });
});
