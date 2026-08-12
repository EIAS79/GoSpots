-- Representative pre-Chunk-01 production-like rows used by the Phase 1 upgrade gate.
-- This fixture is applied only to an isolated CI database after migrations through
-- 20260809044000_organization_trial_policy have been deployed.

INSERT INTO "User" (
  "id", "email", "passwordHash", "name", "emailVerified", "createdAt", "updatedAt"
) VALUES (
  'upgrade-user', 'upgrade-fixture@gospots.local', 'not-a-login-hash', 'Upgrade Fixture', true,
  '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z'
);

INSERT INTO "Shop" (
  "id", "slug", "dashboardKey", "name", "ownerId", "currency", "timezone", "createdAt", "updatedAt"
) VALUES (
  'upgrade-shop', 'upgrade-fixture', 'upgrade-fixture-dashboard-key', 'Upgrade Fixture Venue',
  'upgrade-user', 'PLN', 'Europe/Warsaw',
  '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z'
);

INSERT INTO "Membership" (
  "id", "userId", "shopId", "role", "acceptedAt", "createdAt", "updatedAt"
) VALUES (
  'upgrade-membership', 'upgrade-user', 'upgrade-shop', 'OWNER',
  '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z'
);

INSERT INTO "MenuSection" (
  "id", "shopId", "name", "sortOrder", "createdAt", "updatedAt"
) VALUES (
  'upgrade-section', 'upgrade-shop', 'Legacy Drinks', 0,
  '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z'
);

INSERT INTO "MenuItem" (
  "id", "shopId", "sectionId", "name", "price", "stock", "isAvailable", "createdAt", "updatedAt"
) VALUES (
  'upgrade-item', 'upgrade-shop', 'upgrade-section', 'Legacy Cola', 8.50, 20, true,
  '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z'
);

INSERT INTO "Resource" (
  "id", "shopId", "name", "type", "hourlyRate", "status", "createdAt", "updatedAt"
) VALUES (
  'upgrade-resource', 'upgrade-shop', 'Legacy Billiard 1', 'BILLIARD', 30.00, 'AVAILABLE',
  '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z'
);

INSERT INTO "Reservation" (
  "id", "shopId", "resourceId", "guestName", "partySize", "startsAt", "endsAt", "status", "createdAt", "updatedAt"
) VALUES (
  'upgrade-reservation', 'upgrade-shop', 'upgrade-resource', 'Legacy Guest', 2,
  '2026-08-02T18:00:00.000Z', '2026-08-02T19:00:00.000Z', 'CONFIRMED',
  '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z'
);

INSERT INTO "Transaction" (
  "id", "shopId", "kind", "method", "amount", "currency", "note", "createdById", "createdAt"
) VALUES (
  'upgrade-transaction', 'upgrade-shop', 'SALE', 'CASH', 12.34, 'PLN',
  'Representative historical sale', 'upgrade-user', '2026-08-01T12:00:00.000Z'
);
