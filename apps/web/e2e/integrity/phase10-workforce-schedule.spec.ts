import { expect, test } from '@playwright/test';
import { api, bindVenue, E2E, loginOwner } from '../helpers/app';

test.describe('Phase 10 workforce scheduling @smoke', () => {
  test('planned shifts reject conflicts and expose publish and absence controls', async ({ page }) => {
    await loginOwner(page);
    await bindVenue(page, E2E.venues.cash);

    const staff = await api<Array<{ membershipId: string; displayName: string }>>(
      page,
      'GET',
      '/workforce/phase10/staff',
    );
    const employee = staff.find((row) => row.displayName === 'E2E Staff');
    expect(employee).toBeTruthy();

    const roleName = `Phase 10 E2E Role ${Date.now()}`;
    const role = await api<{ id: string }>(page, 'POST', '/workforce/job-roles', {
      data: { name: roleName, code: `P10-${Date.now()}` },
    });

    const startsAt = new Date(Date.now() + 40 * 86_400_000);
    startsAt.setUTCMinutes(0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 8 * 3_600_000);
    const shift = await api<{ id: string }>(page, 'POST', '/workforce/schedule', {
      data: {
        membershipId: employee!.membershipId,
        jobRoleId: role.id,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        note: 'Phase 10 browser scheduling acceptance',
      },
    });
    expect(shift.id).toBeTruthy();

    await api(page, 'POST', '/workforce/schedule', {
      data: {
        membershipId: employee!.membershipId,
        jobRoleId: role.id,
        startsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
        endsAt: new Date(endsAt.getTime() + 60 * 60_000).toISOString(),
        note: 'This overlap must be rejected',
      },
      expectedStatus: 409,
    });

    await page.goto(`/dashboard/${E2E.venues.cash}/workforce`);
    await page.getByRole('button', { name: 'Schedule' }).click();
    await expect(page.getByRole('heading', { name: 'Planned shifts' })).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: roleName });
    await expect(row).toContainText('E2E Staff');
    await expect(row).toContainText('Draft');

    await row.getByRole('button', { name: 'Publish' }).click();
    await expect(row).toContainText('Published');

    let dialogIndex = 0;
    const dialogHandler = async (dialog: Parameters<typeof page.on<'dialog'>>[1] extends (dialog: infer T) => unknown ? T : never) => {
      dialogIndex += 1;
      await dialog.accept(dialogIndex === 1 ? 'EXCUSED' : 'Phase 10 E2E absence');
    };
    page.on('dialog', dialogHandler);
    await row.getByRole('button', { name: 'Mark absence' }).click();
    await expect(row).toContainText('EXCUSED');
    await expect(row).toContainText('Phase 10 E2E absence');
    page.off('dialog', dialogHandler);

    const persisted = await api<Array<{
      id: string;
      published: boolean;
      absenceStatus: string | null;
      absenceReason: string | null;
    }>>(page, 'GET', '/workforce/phase10/schedule?days=60');
    expect(persisted.find((entry) => entry.id === shift.id)).toMatchObject({
      published: true,
      absenceStatus: 'EXCUSED',
      absenceReason: 'Phase 10 E2E absence',
    });
  });
});