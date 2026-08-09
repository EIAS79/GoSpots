import { readFileSync, writeFileSync } from 'node:fs';

function patch(path, transform) {
  const before = readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) return;
  writeFileSync(path, after);
}

function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`Chunk 02 patch anchor missing: ${label}`);
  return text.replace(from, to);
}

patch('apps/api/src/common/permissions.ts', (text) =>
  replaceOnce(
    text,
    "  TRANSACTION_READ: 'transaction.read',\n  TRANSACTION_WRITE: 'transaction.write',\n",
    "  TRANSACTION_READ: 'transaction.read',\n  TRANSACTION_WRITE: 'transaction.write',\n  CHECKOUT_READ: 'checkout.read',\n  CHECKOUT_WRITE: 'checkout.write',\n",
    'checkout permissions',
  ),
);

patch('apps/api/src/common/idempotency.util.ts', (text) =>
  replaceOnce(
    text,
    "  SHOP_CURRENCY_APPLY: 'shop.currency.apply',\n",
    "  /** Checkout V2 settlement snapshot creation. Required even though no tender is charged yet. */\n  CHECKOUT_SETTLEMENT_CREATE: 'checkout.settlements.create',\n  SHOP_CURRENCY_APPLY: 'shop.currency.apply',\n",
    'checkout idempotency scope',
  ),
);

patch('apps/api/src/app.module.ts', (text) => {
  text = replaceOnce(
    text,
    "import { GuestCheckModule } from './modules/guest-check/guest-check.module';\n",
    "import { GuestCheckModule } from './modules/guest-check/guest-check.module';\nimport { CheckoutModule } from './modules/checkout/checkout.module';\n",
    'checkout module import',
  );
  return replaceOnce(
    text,
    '    GuestCheckModule,\n    StaffApprovalsModule,\n',
    '    GuestCheckModule,\n    CheckoutModule,\n    StaffApprovalsModule,\n',
    'checkout module registration',
  );
});

patch('apps/api/src/modules/finance/finance.module.ts', (text) =>
  replaceOnce(
    text,
    '  ],\n})\nexport class FinanceModule {}\n',
    '  ],\n  exports: [PlayBillingService],\n})\nexport class FinanceModule {}\n',
    'finance PlayBilling export',
  ),
);

patch('apps/api/src/modules/finance/play-billing.service.ts', (text) =>
  text.replace('  private mapPlayBillingRow(\n', '  mapPlayBillingRow(\n'),
);

patch('apps/api/src/modules/guest-check/guest-check.service.ts', (text) => {
  text = replaceOnce(
    text,
    '      status: check.status,\n      guestName: check.guestName,\n',
    '      status: check.status,\n      version: check.version,\n      currentSettlementId: check.currentSettlementId,\n      guestName: check.guestName,\n',
    'guest check serialization version',
  );

  text = replaceOnce(
    text,
    "  private assertOpen(check: Pick<GuestCheck, 'status'>) {\n    if (check.status !== 'OPEN') {\n      throw new ConflictException('Guest check is not open');\n    }\n  }\n\n",
    "  private assertOpen(check: Pick<GuestCheck, 'status'>) {\n    if (check.status !== 'OPEN') {\n      throw new ConflictException('Guest check is not open');\n    }\n  }\n\n  private async invalidateCurrentSettlement(shopId: string, id: string) {\n    const result = await this.prisma.guestCheck.updateMany({\n      where: { id, shopId, status: 'OPEN' },\n      data: { currentSettlementId: null, version: { increment: 1 } },\n    });\n    if (result.count !== 1) {\n      throw new ConflictException('Guest check changed while it was being updated');\n    }\n  }\n\n",
    'guest check settlement invalidation helper',
  );

  text = replaceOnce(
    text,
    "        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),\n      },\n    });\n",
    "        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),\n        currentSettlementId: null,\n        version: { increment: 1 },\n      },\n    });\n",
    'guest check update invalidation',
  );

  text = replaceOnce(
    text,
    "        data: { status: 'VOID', voidedAt: new Date() },\n",
    "        data: {\n          status: 'VOID',\n          voidedAt: new Date(),\n          currentSettlementId: null,\n          version: { increment: 1 },\n        },\n",
    'guest check void invalidation',
  );

  text = replaceOnce(
    text,
    "          status: 'SETTLED',\n          settledAt: new Date(),\n",
    "          status: 'SETTLED',\n          settledAt: new Date(),\n          currentSettlementId: null,\n          version: { increment: 1 },\n",
    'legacy guest check settle invalidation',
  );

  const attachAudit = "    await this.audit.record(actor, {\n      section: 'operations',\n      action: 'guest_check.attach',\n";
  text = replaceOnce(
    text,
    attachAudit,
    "    await this.invalidateCurrentSettlement(shopId, id);\n\n" + attachAudit,
    'guest check attach version bump',
  );

  const detachAudit = "    await this.audit.record(actor, {\n      section: 'operations',\n      action: 'guest_check.detach',\n";
  text = replaceOnce(
    text,
    detachAudit,
    "    await this.invalidateCurrentSettlement(shopId, id);\n\n" + detachAudit,
    'guest check detach version bump',
  );

  return text;
});
