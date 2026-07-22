import { NotFoundException } from '@nestjs/common';
import { BookingMode, ResourceType } from '@prisma/client';
import type { JwtAccessPayload } from '../auth/auth.service';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService.applyTemplate', () => {
  const actor = {
    sub: 'user_1',
    shopId: 'shop_1',
    shopRole: 'OWNER',
    perms: 'resource.write',
  } satisfies JwtAccessPayload;

  function makeService(
    resources: {
      createCategory?: jest.Mock;
      deleteCategory?: jest.Mock;
    },
    shop: { syncVenueCategories?: jest.Mock },
  ) {
    return new OnboardingService(
      {
        createCategory:
          resources.createCategory ??
          jest.fn().mockResolvedValue({ id: 'cat_default' }),
        deleteCategory:
          resources.deleteCategory ?? jest.fn().mockResolvedValue({ ok: true }),
      } as never,
      {
        syncVenueCategories:
          shop.syncVenueCategories ?? jest.fn().mockResolvedValue({}),
      } as never,
    );
  }

  it('creates categories and syncs venue tags for billiard_hall', async () => {
    const createCategory = jest
      .fn()
      .mockResolvedValueOnce({ id: 'cat_billiard' })
      .mockResolvedValueOnce({ id: 'cat_pc' });
    const syncVenueCategories = jest.fn().mockResolvedValue({});
    const service = makeService({ createCategory }, { syncVenueCategories });

    const result = await service.applyTemplate(actor, {
      templateId: 'billiard_hall',
    });

    expect(result).toEqual({
      templateId: 'billiard_hall',
      categoryIds: ['cat_billiard', 'cat_pc'],
    });
    expect(createCategory).toHaveBeenCalledTimes(2);
    expect(createCategory).toHaveBeenNthCalledWith(1, actor, {
      type: ResourceType.BILLIARD,
      name: 'Billiard tables',
      bookingMode: BookingMode.TIME,
      slotMinutes: 60,
      unitCount: 6,
      unitNamePrefix: 'Table',
      rates: [{ label: 'Hourly', durationMinutes: 60, price: 12 }],
      offeringConfig: { schemaVersion: 1, pricePerHour: 12 },
    });
    expect(syncVenueCategories).toHaveBeenCalledWith(actor, {
      presetSlugs: ['billiard-hall'],
      custom: [],
    });
  });

  it('throws NotFoundException for unknown template', async () => {
    const service = makeService({}, {});
    await expect(
      service.applyTemplate(actor, { templateId: 'unknown' as never }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes previous categories best-effort when replace is true', async () => {
    const deleteCategory = jest
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('gone'));
    const createCategory = jest.fn().mockResolvedValue({ id: 'cat_new' });
    const service = makeService(
      { createCategory, deleteCategory },
      { syncVenueCategories: jest.fn().mockResolvedValue({}) },
    );

    await service.applyTemplate(actor, {
      templateId: 'pc_cafe',
      replace: true,
      previousCategoryIds: ['old_a', 'old_b'],
    });

    expect(deleteCategory).toHaveBeenCalledTimes(2);
    expect(deleteCategory).toHaveBeenCalledWith(actor, 'old_a');
    expect(deleteCategory).toHaveBeenCalledWith(actor, 'old_b');
    expect(createCategory).toHaveBeenCalledTimes(1);
  });
});
