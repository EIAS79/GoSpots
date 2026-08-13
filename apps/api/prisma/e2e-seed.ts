import { createHash } from 'crypto';
import argon2 from 'argon2';
import {
  OrganizationAccessMode,
  OrganizationRole,
  PrismaClient,
  ResourceStatus,
  ResourceType,
  ShopRole,
  SubscriptionStatus,
  SubscriptionTier,
  UserAccountType,
} from '@prisma/client';

const prisma = new PrismaClient();

const OWNER_EMAIL = 'e2e.owner@gospots.local';
const STAFF_EMAIL = 'e2e.staff@gospots.local';
const ANALYST_EMAIL = 'e2e.analyst@gospots.local';
const PASSWORD = 'GoSpots-E2E-Only-2026!';

const FEATURE_FLAGS = [
  'checkout_v2',
  'checkout_split',
  'cash_sessions',
  'payments_v1',
  'payment_terminals',
  'device_registry',
  'fiscal_pl',
  'ksef_pl',
  'offline_lite',
  'edge_hub',
  'operations_v2',
  'resource_pricing_v2',
  'menu_v2',
  'kds_v2',
  'inventory_v2',
  'workforce_v1',
  'reservations_v2',
  'promotions_v1',
  'crm_v1',
  'loyalty_v1',
  'events_v2',
  'analytics_v2',
  'organizations_v1',
  'integrations_v1',
  'access_v1',
  'automation_v1',
  'ai_insights',
] as const;

type VenueSeed = {
  key: string;
  name: string;
  venueType: string;
  cashSessionRequired?: boolean;
  resources?: Array<{ name: string; type: ResourceType; hourlyRate: string }>;
};

const VENUES: VenueSeed[] = [
  {
    key: 'gaming',
    name: 'E2E Gaming Club',
    venueType: 'gaming',
    resources: [
      { name: 'Billiard 1', type: ResourceType.BILLIARD, hourlyRate: '30.00' },
      { name: 'Billiard 2', type: ResourceType.BILLIARD, hourlyRate: '30.00' },
    ],
  },
  {
    key: 'restaurant',
    name: 'E2E Restaurant',
    venueType: 'dining',
    resources: [{ name: 'Table 1', type: ResourceType.DINING, hourlyRate: '0.00' }],
  },
  {
    key: 'mixed',
    name: 'E2E Mixed Venue',
    venueType: 'mixed',
    resources: [
      { name: 'Pool 1', type: ResourceType.BILLIARD, hourlyRate: '24.00' },
      { name: 'Dining 1', type: ResourceType.DINING, hourlyRate: '0.00' },
    ],
  },
  {
    key: 'offline',
    name: 'E2E Offline Venue',
    venueType: 'gaming',
    resources: [{ name: 'Offline Table', type: ResourceType.BILLIARD, hourlyRate: '18.00' }],
  },
  { key: 'conflict', name: 'E2E Conflict Venue', venueType: 'gaming' },
  { key: 'payment', name: 'E2E Payment Venue', venueType: 'mixed' },
  {
    key: 'cash',
    name: 'E2E Cash Venue',
    venueType: 'dining',
    cashSessionRequired: true,
  },
  { key: 'org-a', name: 'E2E Organization A', venueType: 'mixed' },
  { key: 'org-b', name: 'E2E Organization B', venueType: 'mixed' },
];

function dashboardKey(key: string) {
  return `e2e-${key}-dashboard-key`;
}

function dashboardKeyHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function assertSafeDatabase() {
  if (process.env.GOSPOTS_E2E_DB !== 'true') {
    throw new Error('Refusing to reset data: GOSPOTS_E2E_DB=true is required.');
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is required.');
  const url = new URL(raw);
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  const safeName = /(^|_)(e2e|ci)($|_)/i.test(url.pathname.replace(/^\//, ''));
  if (!local && !safeName) {
    throw new Error(`Refusing to reset non-E2E database host/name: ${url.hostname}${url.pathname}`);
  }
}

async function resetDatabase() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `;
  if (!tables.length) return;
  const quoted = tables
    .map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`)
    .join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}

async function createVenue(
  ownerId: string,
  venue: VenueSeed,
): Promise<{ shopId: string; menuItemId: string; resourceIds: string[] }> {
  const shopId = `e2e-shop-${venue.key}`;
  const key = dashboardKey(venue.key);
  await prisma.shop.create({
    data: {
      id: shopId,
      slug: `e2e-${venue.key}`,
      dashboardKey: key,
      dashboardKeyHash: dashboardKeyHash(key),
      name: venue.name,
      displayName: venue.name,
      ownerId,
      venueType: venue.venueType,
      city: 'Warsaw',
      country: 'PL',
      locale: 'en',
      timezone: 'Europe/Warsaw',
      currency: 'PLN',
      isPublished: false,
      cashSessionRequired: venue.cashSessionRequired ?? false,
      cashBlindCountEnabled: true,
      cashVarianceApprovalThreshold: '1.00',
    },
  });

  await prisma.subscription.create({
    data: {
      shopId,
      tier: SubscriptionTier.ENTERPRISE,
      status: SubscriptionStatus.ACTIVE,
      packId: '',
      billingCurrency: 'PLN',
      staffSeatQuantity: 20,
      currentPeriodEnd: new Date('2030-01-01T00:00:00.000Z'),
    },
  });

  const membership = await prisma.membership.create({
    data: {
      id: `e2e-membership-owner-${venue.key}`,
      userId: ownerId,
      shopId,
      role: ShopRole.OWNER,
      isActive: true,
      acceptedAt: new Date(),
    },
  });
  await prisma.membershipPermission.create({
    data: { membershipId: membership.id, permission: '*' },
  });

  await prisma.shopFeatureFlag.createMany({
    data: FEATURE_FLAGS.map((feature) => ({ shopId, feature, enabled: true })),
  });

  const section = await prisma.menuSection.create({
    data: {
      id: `e2e-section-${venue.key}`,
      shopId,
      name: venue.key === 'restaurant' ? 'Kitchen' : 'Drinks',
      sortOrder: 0,
    },
  });
  const item = await prisma.menuItem.create({
    data: {
      id: `e2e-item-${venue.key}`,
      shopId,
      sectionId: section.id,
      name: venue.key === 'restaurant' ? 'Burger E2E' : 'Cola E2E',
      price: venue.key === 'restaurant' ? '28.00' : '8.00',
      stock: 100,
      stockDaily: 100,
      trackStock: true,
      isAvailable: true,
    },
  });

  const resourceIds: string[] = [];
  if (venue.resources?.length) {
    const category = await prisma.resourceCategory.create({
      data: {
        id: `e2e-category-${venue.key}`,
        shopId,
        type: venue.resources[0].type,
        name: `${venue.name} resources`,
        slotMinutes: 60,
      },
    });
    for (const [index, resource] of venue.resources.entries()) {
      const row = await prisma.resource.create({
        data: {
          id: `e2e-resource-${venue.key}-${index + 1}`,
          shopId,
          categoryId: category.id,
          name: resource.name,
          type: resource.type,
          hourlyRate: resource.hourlyRate,
          status: ResourceStatus.AVAILABLE,
          capacity: resource.type === ResourceType.DINING ? 4 : null,
          sortOrder: index,
        },
      });
      resourceIds.push(row.id);
    }
  }

  return { shopId, menuItemId: item.id, resourceIds };
}

async function main() {
  assertSafeDatabase();
  await resetDatabase();

  const passwordHash = await argon2.hash(PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  });

  const owner = await prisma.user.create({
    data: {
      id: 'e2e-owner',
      email: OWNER_EMAIL,
      passwordHash,
      name: 'E2E Owner',
      accountType: UserAccountType.VENUE_OWNER,
      emailVerified: true,
    },
  });
  const staff = await prisma.user.create({
    data: {
      id: 'e2e-staff',
      email: STAFF_EMAIL,
      passwordHash,
      name: 'E2E Staff',
      accountType: UserAccountType.VENUE_STAFF,
      staffHandle: 'e2e.staff',
      emailVerified: true,
      passwordSetAt: new Date(),
    },
  });
  const analyst = await prisma.user.create({
    data: {
      id: 'e2e-analyst',
      email: ANALYST_EMAIL,
      passwordHash,
      name: 'E2E Analyst',
      accountType: UserAccountType.VENUE_OWNER,
      emailVerified: true,
    },
  });

  const seeded = new Map<string, Awaited<ReturnType<typeof createVenue>>>();
  for (const venue of VENUES) {
    seeded.set(venue.key, await createVenue(owner.id, venue));
  }

  for (const key of ['restaurant', 'cash']) {
    const shopId = seeded.get(key)!.shopId;
    const membership = await prisma.membership.create({
      data: {
        id: `e2e-membership-staff-${key}`,
        userId: staff.id,
        shopId,
        role: ShopRole.STAFF,
        isActive: true,
        acceptedAt: new Date(),
      },
    });
    await prisma.membershipPermission.createMany({
      data: [
        'menu.read',
        'transaction.read',
        'transaction.write',
        'checkout.read',
        'checkout.write',
        'cash.open',
        'cash.movement',
        'cash.close',
      ].map((permission) => ({ membershipId: membership.id, permission })),
    });
  }

  const orgAShopId = seeded.get('org-a')!.shopId;
  const orgBShopId = seeded.get('org-b')!.shopId;
  const analystMembership = await prisma.membership.create({
    data: {
      id: 'e2e-membership-analyst-org-a',
      userId: analyst.id,
      shopId: orgAShopId,
      role: ShopRole.STAFF,
      isActive: true,
      acceptedAt: new Date(),
    },
  });
  await prisma.membershipPermission.createMany({
    data: ['transaction.read', 'checkout.read'].map((permission) => ({
      membershipId: analystMembership.id,
      permission,
    })),
  });

  const organization = await prisma.organization.create({
    data: {
      id: 'e2e-organization',
      name: 'E2E Organization',
      slug: 'e2e-organization',
      createdById: owner.id,
    },
  });
  await prisma.organizationShop.createMany({
    data: [
      { id: 'e2e-organization-shop-a', organizationId: organization.id, shopId: orgAShopId, sortOrder: 0 },
      { id: 'e2e-organization-shop-b', organizationId: organization.id, shopId: orgBShopId, sortOrder: 1 },
    ],
  });
  await prisma.organizationMembership.createMany({
    data: [
      {
        id: 'e2e-organization-owner',
        organizationId: organization.id,
        userId: owner.id,
        role: OrganizationRole.OWNER,
        accessMode: OrganizationAccessMode.ALL_SHOPS,
      },
      {
        id: 'e2e-organization-analyst',
        organizationId: organization.id,
        userId: analyst.id,
        role: OrganizationRole.ANALYST,
        accessMode: OrganizationAccessMode.EXPLICIT,
      },
    ],
  });

  console.log(
    JSON.stringify(
      {
        owner: { email: OWNER_EMAIL, password: PASSWORD },
        staff: { email: STAFF_EMAIL, password: PASSWORD },
        analyst: { email: ANALYST_EMAIL, password: PASSWORD },
        venues: Object.fromEntries(
          [...seeded.entries()].map(([key, value]) => [key, value]),
        ),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
