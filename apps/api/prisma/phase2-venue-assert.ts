import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Phase 2 venue assertion failed: ${message}`);
}

async function main() {
  const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name, column_name) IN (
        ('Shop', 'legalName'),
        ('Shop', 'branchCode'),
        ('Resource', 'code'),
        ('Resource', 'configurationState'),
        ('Resource', 'version'),
        ('Resource', 'layoutX'),
        ('GamingSection', 'zoneType'),
        ('GamingSection', 'isHidden'),
        ('MenuItem', 'kind'),
        ('MenuItem', 'unit'),
        ('MenuItem', 'sku'),
        ('MenuItem', 'barcode'),
        ('Device', 'claimState'),
        ('Device', 'version'),
        ('OperationsRatePlan', 'billingMode'),
        ('OperationsRatePlan', 'weekdays'),
        ('OperationsSession', 'billingMode'),
        ('OperationsSession', 'participantCount')
      )
  `;
  invariant(columns.length === 18, `required columns found ${columns.length}/18`);

  const constraints = await prisma.$queryRaw<Array<{ conname: string; convalidated: boolean }>>`
    SELECT conname, convalidated
    FROM pg_constraint
    WHERE conname IN (
      'ResourceCategory_version_positive',
      'GamingSection_version_positive',
      'Resource_version_positive',
      'Resource_layout_dimensions_positive',
      'Device_version_positive',
      'OperationsRatePlan_phase2_values_valid',
      'OperationsSession_phase2_values_valid',
      'OperationsRatePlan_resource_same_shop_fkey',
      'OperationsRatePlan_category_same_shop_fkey'
    )
  `;
  invariant(constraints.length === 9, `required constraints found ${constraints.length}/9`);
  invariant(constraints.every((constraint) => constraint.convalidated), 'one or more constraints are not validated');

  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'Resource_shopId_code_key',
        'MenuItem_shopId_sku_key',
        'MenuItem_shopId_barcode_key',
        'OrganizationShop_organizationId_branchCode_key',
        'GamingSection_shopId_id_key'
      )
  `;
  invariant(indexes.length === 5, `required unique indexes found ${indexes.length}/5`);

  const badResources = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM "Resource"
    WHERE "code" IS NULL OR "version" < 1 OR "layoutWidth" < 1 OR "layoutHeight" < 1
  `;
  invariant(badResources[0]?.count === 0n, 'invalid historical resources survived migration');

  const duplicateCodes = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT "shopId", "code" FROM "Resource" GROUP BY "shopId", "code" HAVING COUNT(*) > 1
    ) duplicate
  `;
  invariant(duplicateCodes[0]?.count === 0n, 'resource code backfill created duplicates');

  const crossTenantLinks = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT (
      (SELECT COUNT(*) FROM "Resource" r JOIN "ResourceCategory" c ON c.id = r."categoryId" WHERE r."shopId" <> c."shopId") +
      (SELECT COUNT(*) FROM "GamingSection" z JOIN "ResourceCategory" c ON c.id = z."categoryId" WHERE z."shopId" <> c."shopId") +
      (SELECT COUNT(*) FROM "Resource" r JOIN "GamingSection" z ON z.id = r."sectionId" WHERE r."shopId" <> z."shopId") +
      (SELECT COUNT(*) FROM "DiningTableGroup" g JOIN "GamingSection" z ON z.id = g."sectionId" WHERE g."shopId" <> z."shopId")
    )::bigint AS count
  `;
  invariant(crossTenantLinks[0]?.count === 0n, 'cross-tenant venue configuration link exists');

  const historicalResource = await prisma.resource.findUnique({
    where: { id: 'upgrade-resource' },
  });
  if (historicalResource) {
    invariant(historicalResource.shopId === 'upgrade-shop', 'historical resource tenant changed');
    invariant(historicalResource.code.startsWith('R-'), 'historical resource code was not backfilled');
    invariant(historicalResource.configurationState === 'ENABLED', 'historical resource state changed');
    const historicalItem = await prisma.menuItem.findUnique({ where: { id: 'upgrade-item' } });
    invariant(historicalItem?.kind === 'PRODUCT', 'historical catalog kind was not preserved');
    invariant(historicalItem?.unit === 'UNIT', 'historical catalog unit was not defaulted');
    invariant(historicalItem?.price.toFixed(2) === '8.50', 'historical catalog price changed');
  }

  console.log('Phase 2 venue schema, constraints, indexes and historical backfills passed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
