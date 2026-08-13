import { expect, type APIResponse, type Page } from '@playwright/test';

export const E2E = {
  owner: {
    email: 'e2e.owner@gospots.local',
    password: 'GoSpots-E2E-Only-2026!',
  },
  analyst: {
    email: 'e2e.analyst@gospots.local',
    password: 'GoSpots-E2E-Only-2026!',
  },
  venues: {
    gaming: 'e2e-gaming',
    restaurant: 'e2e-restaurant',
    mixed: 'e2e-mixed',
    offline: 'e2e-offline',
    conflict: 'e2e-conflict',
    payment: 'e2e-payment',
    cash: 'e2e-cash',
    orgA: 'e2e-org-a',
    orgB: 'e2e-org-b',
  },
} as const;

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

type ApiOptions = {
  data?: JsonValue;
  idempotencyKey?: string;
  expectedStatus?: number;
  headers?: Record<string, string>;
};

async function responseBody(response: APIResponse) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function dismissCookiePreferences(page: Page) {
  const preferences = page.locator('aside[aria-label="Cookie preferences"]');

  try {
    await preferences.waitFor({ state: 'visible', timeout: 2_000 });
  } catch {
    return;
  }

  await preferences.getByRole('button', { name: /reject optional/i }).click();
  await expect(preferences).toBeHidden();
}

export async function api<T = any>(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const mutation = method !== 'GET';
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };
  if (mutation) {
    const cookies = await page.context().cookies();
    const csrf = cookies.find((cookie) => cookie.name === 'csrf_token')?.value;
    if (!csrf) throw new Error(`Missing csrf_token before ${method} ${path}`);
    headers['x-csrf-token'] = csrf;
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    data: options.data,
    headers,
    failOnStatusCode: false,
  });
  const body = await responseBody(response);
  const expectedStatus = options.expectedStatus;
  if (expectedStatus != null) {
    expect(response.status(), `${method} ${path}: ${JSON.stringify(body)}`).toBe(expectedStatus);
  } else {
    expect(response.ok(), `${method} ${path}: ${JSON.stringify(body)}`).toBeTruthy();
  }
  return body as T;
}

export async function loginOwner(
  page: Page,
  credentials: { email: string; password: string } = E2E.owner,
) {
  await page.goto('/login');
  await dismissCookiePreferences(page);
  const ownerTab = page.getByRole('tab', { name: /owner/i });
  if (await ownerTab.count()) await ownerTab.click();
  await page.locator('input[type="email"]').first().fill(credentials.email);
  await page.locator('input[type="password"]').first().fill(credentials.password);
  await page.locator('form').first().getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 20_000 });
}

export async function bindVenue(page: Page, venuePath: string) {
  await api(page, 'POST', `/auth/venue/${encodeURIComponent(venuePath)}/session`, {
    data: {},
  });
  await page.goto(`/dashboard/${venuePath}`);
  await expect(page).toHaveURL(new RegExp(`/dashboard/${venuePath}(?:/|$)`));
}

export async function createGuestCheckFromUi(
  page: Page,
  venuePath: string,
  label: string,
  guestName = 'E2E Guest',
) {
  await page.goto(`/dashboard/${venuePath}/checkout`);
  await page.getByRole('button', { name: /new guest check/i }).first().click();
  await page.getByLabel(/guest name/i).last().fill(guestName);
  await page.getByLabel(/check label/i).last().fill(label);
  await page.getByRole('button', { name: /create check/i }).last().click();
  await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  const response = await api<{ checks: Array<any> }>(page, 'GET', '/guest-checks?status=OPEN');
  const check = response.checks.find((row) => row.label === label);
  expect(check, `GuestCheck ${label} was not returned by API`).toBeTruthy();
  return check;
}

export async function completeLegacyOrder(
  page: Page,
  checkId: string,
  menuItemId: string,
  label: string,
) {
  const order = await api<any>(page, 'POST', '/finance/orders', {
    data: { label, guestCount: 1 },
    idempotencyKey: `${label}-order-create`,
  });
  await api(page, 'POST', `/finance/orders/${order.id}/lines`, {
    data: { menuItemId, quantity: 1 },
    idempotencyKey: `${label}-order-line`,
  });
  await api(page, 'PATCH', `/finance/orders/${order.id}`, {
    data: { status: 'COMPLETED' },
    idempotencyKey: `${label}-order-complete`,
  });
  await api(page, 'POST', `/guest-checks/${checkId}/attach`, {
    data: { shopOrderId: order.id },
  });
  return order;
}

async function ensureE2EPlayHours(page: Page) {
  await api(page, 'PUT', '/hours/weekly', {
    data: {
      days: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        isClosed: false,
        opensAt: '00:00',
        closesAt: '23:59',
      })),
    },
  });
}

export async function endedPlaySession(
  page: Page,
  checkId: string,
  resourceId: string,
  label: string,
  amount = 30,
) {
  await ensureE2EPlayHours(page);
  const session = await api<any>(page, 'POST', '/finance/play-sessions', {
    data: { resourceId, amount, label },
    idempotencyKey: `${label}-play-create`,
  });
  await api(page, 'POST', `/guest-checks/${checkId}/attach`, {
    data: { playSessionId: session.id },
  });
  const ended = await api<any>(page, 'PATCH', `/finance/play-sessions/${session.id}`, {
    data: { endSession: true },
    idempotencyKey: `${label}-play-end`,
  });
  expect(ended.endedAt).toBeTruthy();
  return ended;
}

export async function settleAndSplit(
  page: Page,
  checkId: string,
  methods: ['CASH' | 'MANUAL_CARD' | 'OTHER', 'CASH' | 'MANUAL_CARD' | 'OTHER'] = [
    'CASH',
    'MANUAL_CARD',
  ],
) {
  const preview = await api<any>(page, 'POST', `/checkout/checks/${checkId}/preview`, {
    data: {},
  });
  expect(Number(preview.amountDue)).toBeGreaterThan(0);
  const settlement = await api<any>(page, 'POST', `/checkout/checks/${checkId}/settlements`, {
    data: { expectedVersion: preview.checkVersion },
    idempotencyKey: `${checkId}-settlement`,
  });
  const groups = await api<any>(page, 'POST', `/checkout/settlements/${settlement.id}/payment-groups/preview`, {
    data: { mode: 'EQUAL', parts: 2 },
  });
  expect(groups.groups).toHaveLength(2);

  let state = await api<any>(page, 'GET', `/checkout/settlements/${settlement.id}/payment-state`);
  for (const [index, group] of groups.groups.entries()) {
    state = await api<any>(page, 'POST', `/checkout/settlements/${settlement.id}/payments`, {
      data: {
        expectedCheckVersion: state.guestCheckVersion,
        method: methods[index],
        allocationKind: 'EQUAL',
        allocations: group.allocations.map((allocation: any) => ({
          snapshotId: allocation.snapshotId,
          amount: allocation.amount,
        })),
      },
      idempotencyKey: `${checkId}-payment-${index + 1}`,
    });
  }
  expect(state.state).toBe('PAID');
  expect(Number(state.amountDue)).toBe(0);
  return { settlement, state };
}

export async function closePaidCheck(page: Page, checkId: string) {
  return api<any>(page, 'POST', `/checkout/checks/${checkId}/close`, { data: {} });
}
