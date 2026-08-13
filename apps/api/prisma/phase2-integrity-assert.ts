import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const REQUIRED_CONSTRAINTS = [
  'Ticket_product_same_shop_fk',
  'Ticket_order_same_shop_fk',
  'TicketScan_ticket_same_shop_fk',
  'RfidCredential_wallet_same_shop_fk',
  'RfidWalletEntry_wallet_same_shop_fk',
  'RfidWalletEntry_reversal_same_shop_fk',
  'RfidTap_credential_same_shop_fk',
  'RfidTap_wallet_same_shop_fk',
  'AutomationExecution_rule_same_shop_fk',
  'AutomationStep_execution_same_shop_fk',
  'AutomationDead_execution_same_shop_fk',
  'AiInsightRun_snapshot_same_shop_fk',
  'AiInsight_run_same_shop_fk',
  'AiInsightFeedback_insight_same_shop_fk',
  'TicketProduct_price_nonnegative_ck',
  'TicketProduct_scan_count_ck',
  'TicketProduct_validity_ck',
  'TicketOrder_total_nonnegative_ck',
  'Ticket_scan_bounds_ck',
  'RfidWallet_balance_nonnegative_ck',
  'RfidWallet_version_nonnegative_ck',
  'RfidWalletEntry_balance_nonnegative_ck',
  'AutomationExecution_attempt_nonnegative_ck',
  'AutomationStep_index_nonnegative_ck',
  'AutomationDead_replay_nonnegative_ck',
  'AiInsightFeedback_rating_ck',
] as const;

type ConstraintRow = {
  conname: string;
  contype: string;
  convalidated: boolean;
};

async function main() {
  const rows = await prisma.$queryRaw<ConstraintRow[]>`
    SELECT conname, contype, convalidated
    FROM pg_constraint
    WHERE conname = ANY(${REQUIRED_CONSTRAINTS as unknown as string[]}::text[])
  `;
  const byName = new Map(rows.map((row) => [row.conname, row]));
  const missing = REQUIRED_CONSTRAINTS.filter((name) => !byName.has(name));
  if (missing.length) {
    throw new Error(
      `Phase 2 database integrity constraints missing: ${missing.join(', ')}`,
    );
  }

  const unexpectedType = rows.filter(
    (row) => row.contype !== 'f' && row.contype !== 'c',
  );
  if (unexpectedType.length) {
    throw new Error(
      `Unexpected Phase 2 constraint type(s): ${unexpectedType
        .map((row) => `${row.conname}:${row.contype}`)
        .join(', ')}`,
    );
  }

  console.log(
    `Phase 2 database integrity assertions passed (${rows.length} constraints).`,
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
