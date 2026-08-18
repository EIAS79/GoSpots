import { PrismaService } from '../src/prisma/prisma.service';

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const prefix = 'phase11_upgrade_fixture';
  try {
    const [product, order, wallet, credential] = await Promise.all([
      prisma.ticketProduct.findUnique({ where: { id: `${prefix}_product` } }),
      prisma.ticketOrder.findUnique({ where: { id: `${prefix}_order` } }),
      prisma.rfidWallet.findUnique({ where: { id: `${prefix}_wallet` } }),
      prisma.rfidCredential.findUnique({ where: { id: `${prefix}_credential` } }),
    ]);

    invariant(product, 'Legacy ticket product was lost during Phase 11 upgrade.');
    invariant(product.menuItemId === null, 'Legacy ticket product must remain unlinked until explicitly migrated to canonical commerce.');
    invariant(product.priceMinor === 2500, 'Legacy ticket price evidence changed during upgrade.');

    invariant(order, 'Legacy ticket order was lost during Phase 11 upgrade.');
    invariant(order.status === 'PAID', 'Legacy ticket-order state changed during upgrade.');
    invariant(order.totalMinor === 2500, 'Legacy ticket-order monetary evidence changed during upgrade.');
    invariant(order.settlementId === null, 'Legacy order must not receive fabricated settlement lineage.');

    invariant(wallet, 'Legacy RFID wallet was lost during Phase 11 upgrade.');
    invariant(wallet.balanceMinor === 4200, 'Legacy RFID balance evidence changed during upgrade.');
    invariant(credential, 'Legacy RFID credential was lost during Phase 11 upgrade.');
    invariant(credential.walletId === wallet.id, 'Legacy RFID credential/wallet lineage changed during upgrade.');
    invariant(credential.storedValueAccountId === null, 'Upgrade must not invent a canonical stored-value account.');

    const zone = await prisma.accessZone.create({
      data: {
        shopId: `${prefix}_shop`,
        code: 'UPGRADE-OK',
        name: 'Upgrade validation zone',
        capacity: 10,
      },
    });
    invariant(zone.id, 'Phase 11 tables are not writable after upgrade.');

    console.log(JSON.stringify({ ok: true, preserved: { product: product.id, order: order.id, wallet: wallet.id, credential: credential.id }, zoneId: zone.id }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
