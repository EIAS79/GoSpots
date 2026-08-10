import fs from 'node:fs';

function patch(path, mutate) {
  const before = fs.readFileSync(path, 'utf8');
  const after = mutate(before);
  if (after !== before) fs.writeFileSync(path, after);
}

function replaceOnce(source, anchor, replacement, label) {
  if (!source.includes(anchor)) throw new Error(`Chunk 05 patch anchor missing: ${label}`);
  return source.replace(anchor, replacement);
}

patch('apps/api/prisma/schema.prisma', (input) => {
  let source = input;
  if (!source.includes('enum CashSessionStatus {')) {
    source = replaceOnce(
      source,
      'enum CheckoutPaymentMethod {',
      `enum CashSessionStatus {\n  OPEN\n  CLOSED\n}\n\nenum CashMovementType {\n  CASH_SALE\n  PAY_IN\n  PAY_OUT\n  CASH_REFUND\n  SAFE_DROP\n}\n\nenum ShiftCloseApprovalStatus {\n  PENDING\n  APPROVED\n}\n\nenum CheckoutPaymentMethod {`,
      'cash enums',
    );
  }
  if (!source.includes('cashSessionRequired Boolean')) {
    source = replaceOnce(
      source,
      '  venueType     String?\n',
      '  venueType     String?\n  /// Require an OPEN cashier session before CASH checkout tender.\n  cashSessionRequired Boolean @default(true)\n  /// Hide expected drawer cash from cashiers until they submit a count.\n  cashBlindCountEnabled Boolean @default(true)\n  /// Absolute variance above this amount requires explicit approval before close.\n  cashVarianceApprovalThreshold Decimal @default(0) @db.Decimal(19, 4)\n',
      'Shop cash policy',
    );
  }
  if (!source.includes('cashDrawers CashDrawer[]')) {
    source = replaceOnce(
      source,
      '  guestCheckMergeEvents GuestCheckMergeEvent[]\n',
      '  guestCheckMergeEvents GuestCheckMergeEvent[]\n  cashDrawers CashDrawer[]\n  cashSessions CashSession[]\n  cashMovements CashMovement[]\n  cashCounts CashCount[]\n  shiftCloseApprovals ShiftCloseApproval[]\n',
      'Shop cash relations',
    );
  }
  if (!source.includes('  cashMovement    CashMovement?')) {
    source = replaceOnce(
      source,
      '  allocations   PaymentAllocation[]\n\n  @@index([shopId, status, createdAt])',
      '  allocations   PaymentAllocation[]\n  cashMovement    CashMovement?\n\n  @@index([shopId, status, createdAt])',
      'Payment cash movement relation',
    );
  }
  if (!source.includes('model CashDrawer {')) {
    source += `\n\n/// Physical cash drawer. Sessions provide the operational shift boundary.\nmodel CashDrawer {\n  id        String   @id @default(cuid())\n  shopId    String\n  shop      Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  name      String\n  isActive  Boolean  @default(true)\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n  sessions  CashSession[]\n\n  @@unique([shopId, name])\n  @@index([shopId, isActive])\n}\n\n/// One cashier's physical-cash shift on one drawer.\nmodel CashSession {\n  id                 String            @id @default(cuid())\n  shopId             String\n  shop               Shop              @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  drawerId           String\n  drawer             CashDrawer        @relation(fields: [drawerId], references: [id], onDelete: Restrict)\n  status             CashSessionStatus @default(OPEN)\n  openedById         String\n  openedAt           DateTime          @default(now())\n  openingFloat       Decimal           @default(0) @db.Decimal(19, 4)\n  currency           String\n  version            Int               @default(1)\n  closedExpectedCash Decimal?          @db.Decimal(19, 4)\n  countedCash        Decimal?          @db.Decimal(19, 4)\n  variance           Decimal?          @db.Decimal(19, 4)\n  closedAt           DateTime?\n  closedById         String?\n  closeNote          String?\n  createdAt          DateTime          @default(now())\n  updatedAt          DateTime          @updatedAt\n  movements          CashMovement[]\n  counts             CashCount[]\n  approvals          ShiftCloseApproval[]\n\n  @@index([shopId, status, openedAt])\n  @@index([drawerId, status])\n}\n\n/// Immutable cash event inside an OPEN cash session. CASH_SALE links to Checkout Payment.\nmodel CashMovement {\n  id            String           @id @default(cuid())\n  shopId        String\n  shop          Shop             @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  cashSessionId String\n  cashSession   CashSession      @relation(fields: [cashSessionId], references: [id], onDelete: Restrict)\n  type          CashMovementType\n  amount        Decimal          @db.Decimal(19, 4)\n  currency      String\n  reasonCategory String\n  note          String?\n  actorId       String\n  paymentId     String?          @unique\n  payment       Payment?         @relation(fields: [paymentId], references: [id], onDelete: Restrict)\n  occurredAt    DateTime         @default(now())\n  createdAt     DateTime         @default(now())\n\n  @@index([cashSessionId, occurredAt])\n  @@index([shopId, type, occurredAt])\n}\n\n/// Submitted physical drawer count. Expected value is captured atomically for reconciliation.\nmodel CashCount {\n  id                       String      @id @default(cuid())\n  shopId                   String\n  shop                     Shop        @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  cashSessionId            String\n  cashSession              CashSession @relation(fields: [cashSessionId], references: [id], onDelete: Restrict)\n  countedAmount            Decimal     @db.Decimal(19, 4)\n  expectedCashAtSubmission Decimal     @db.Decimal(19, 4)\n  variance                 Decimal     @db.Decimal(19, 4)\n  blindCount               Boolean\n  actorId                  String\n  submittedAt              DateTime    @default(now())\n  createdAt                DateTime    @default(now())\n  approval                 ShiftCloseApproval?\n\n  @@index([cashSessionId, submittedAt])\n  @@index([shopId, submittedAt])\n}\n\n/// Explicit approval required when absolute close variance exceeds Shop threshold.\nmodel ShiftCloseApproval {\n  id            String                   @id @default(cuid())\n  shopId        String\n  shop          Shop                     @relation(fields: [shopId], references: [id], onDelete: Cascade)\n  cashSessionId String\n  cashSession   CashSession              @relation(fields: [cashSessionId], references: [id], onDelete: Restrict)\n  cashCountId   String                   @unique\n  cashCount     CashCount                @relation(fields: [cashCountId], references: [id], onDelete: Restrict)\n  status        ShiftCloseApprovalStatus @default(PENDING)\n  requestedById String\n  approvedById  String?\n  variance      Decimal                  @db.Decimal(19, 4)\n  threshold     Decimal                  @db.Decimal(19, 4)\n  note          String?\n  requestedAt   DateTime                 @default(now())\n  decidedAt     DateTime?\n  createdAt     DateTime                 @default(now())\n  updatedAt     DateTime                 @updatedAt\n\n  @@index([shopId, status, requestedAt])\n  @@index([cashSessionId, requestedAt])\n}\n`;
  }
  return source;
});

patch('apps/api/src/common/permissions.ts', (source) => {
  if (source.includes("CASH_OPEN: 'cash.open'")) return source;
  return replaceOnce(
    source,
    "  CHECKOUT_WRITE: 'checkout.write',\n",
    "  CHECKOUT_WRITE: 'checkout.write',\n  CASH_OPEN: 'cash.open',\n  CASH_MOVEMENT: 'cash.movement',\n  CASH_CLOSE: 'cash.close',\n  CASH_VIEW_EXPECTED: 'cash.view_expected',\n  CASH_APPROVE_VARIANCE: 'cash.approve_variance',\n",
    'cash permissions',
  );
});

patch('apps/api/src/common/idempotency.util.ts', (source) => {
  if (source.includes("CASH_SESSION_OPEN: 'cash.sessions.open'")) return source;
  return replaceOnce(
    source,
    "  CHECKOUT_CHARGES_MOVE: 'checkout.checks.move-charges',\n",
    "  CHECKOUT_CHARGES_MOVE: 'checkout.checks.move-charges',\n  CASH_SESSION_OPEN: 'cash.sessions.open',\n  CASH_MOVEMENT_CREATE: 'cash.movements.create',\n  CASH_COUNT_SUBMIT: 'cash.counts.submit',\n  CASH_VARIANCE_APPROVE: 'cash.variance.approve',\n  CASH_SESSION_CLOSE: 'cash.sessions.close',\n",
    'cash idempotency scopes',
  );
});

patch('apps/api/src/modules/foundation/feature-flag.service.ts', (source) => {
  if (/DEFAULT_ENABLED_FEATURES[\s\S]*'cash_sessions'/.test(source)) return source;
  return replaceOnce(
    source,
    "  'checkout_split',\n]);",
    "  'checkout_split',\n  'cash_sessions',\n]);",
    'cash_sessions product default',
  );
});

patch('apps/api/src/app.module.ts', (source) => {
  if (!source.includes("import { CashModule } from './modules/cash/cash.module';")) {
    source = replaceOnce(
      source,
      "import { CheckoutModule } from './modules/checkout/checkout.module';",
      "import { CheckoutModule } from './modules/checkout/checkout.module';\nimport { CashModule } from './modules/cash/cash.module';",
      'CashModule import',
    );
  }
  if (!/\n    CashModule,/.test(source)) {
    source = replaceOnce(
      source,
      '    CheckoutModule,\n',
      '    CheckoutModule,\n    CashModule,\n',
      'CashModule registration',
    );
  }
  return source;
});

patch('apps/api/src/modules/checkout/checkout.module.ts', (source) => {
  if (!source.includes("import { CashModule } from '../cash/cash.module';")) {
    source = replaceOnce(
      source,
      "import { FinanceModule } from '../finance/finance.module';",
      "import { FinanceModule } from '../finance/finance.module';\nimport { CashModule } from '../cash/cash.module';",
      'Checkout CashModule import',
    );
  }
  source = source.replace('  imports: [FinanceModule],', '  imports: [FinanceModule, CashModule],');
  return source;
});

patch('apps/api/src/modules/checkout/checkout-payment.service.ts', (source) => {
  if (!source.includes('CheckoutPaymentMethod,')) {
    source = source.replace(
      "import { CheckoutPaymentStatus, Prisma } from '@prisma/client';",
      "import {\n  CheckoutPaymentMethod,\n  CheckoutPaymentStatus,\n  Prisma,\n} from '@prisma/client';",
    );
  }
  if (!source.includes("import { CashService } from '../cash/cash.service';")) {
    source = replaceOnce(
      source,
      "import type { JwtAccessPayload } from '../auth/auth.service';",
      "import type { JwtAccessPayload } from '../auth/auth.service';\nimport { CashService } from '../cash/cash.service';",
      'CashService import',
    );
  }
  if (!source.includes('private readonly cash: CashService')) {
    source = replaceOnce(
      source,
      '    private readonly audit: AuditService,\n',
      '    private readonly audit: AuditService,\n    private readonly cash: CashService,\n',
      'CashService constructor injection',
    );
  }
  if (!source.includes('const cashSessionId =')) {
    source = replaceOnce(
      source,
      "      assertExpectedVersion(\n        settlement.guestCheck.version,\n        dto.expectedCheckVersion,\n        {\n          aggregateType: 'guest_check',\n          aggregateId: settlement.guestCheckId,\n        },\n      );\n\n      const remainingRows",
      "      assertExpectedVersion(\n        settlement.guestCheck.version,\n        dto.expectedCheckVersion,\n        {\n          aggregateType: 'guest_check',\n          aggregateId: settlement.guestCheckId,\n        },\n      );\n\n      const cashSessionId =\n        dto.method === CheckoutPaymentMethod.CASH\n          ? await this.cash.requireSessionForCashPayment(\n              tx,\n              actor,\n              settlement.currency,\n            )\n          : null;\n\n      const remainingRows",
      'cash payment session preflight',
    );
  }
  if (!source.includes('const cashMovement =')) {
    source = replaceOnce(
      source,
      "      await tx.paymentAllocation.createMany({",
      "      const cashMovement =\n        dto.method === CheckoutPaymentMethod.CASH\n          ? await this.cash.recordCashSale(tx, {\n              shopId,\n              cashSessionId,\n              actorId: actor.sub,\n              paymentId: payment.id,\n              amount: paymentAmount,\n              currency: settlement.currency,\n            })\n          : null;\n\n      await tx.paymentAllocation.createMany({",
      'automatic cash sale movement',
    );
    source = replaceOnce(
      source,
      "        paymentId: payment.id,\n        settlement: hydrated,\n",
      "        paymentId: payment.id,\n        cashSessionId,\n        cashMovementId: cashMovement?.id ?? null,\n        settlement: hydrated,\n",
      'cash movement result ids',
    );
    source = replaceOnce(
      source,
      "        paymentId: result.paymentId,\n        method: dto.method,",
      "        paymentId: result.paymentId,\n        cashSessionId: result.cashSessionId,\n        cashMovementId: result.cashMovementId,\n        method: dto.method,",
      'cash movement audit meta',
    );
  }
  return source;
});

patch('apps/web/src/components/layout/tenant-shell.tsx', (source) => {
  if (!source.includes('CircleDollarSign,')) {
    source = replaceOnce(
      source,
      '  ClipboardCheck,\n',
      '  ClipboardCheck,\n  CircleDollarSign,\n',
      'cash nav icon',
    );
  }
  if (!source.includes('segment: "/my-shift"')) {
    source = replaceOnce(
      source,
      `      {\n        segment: "/checkout",\n        labelKey: "nav.guestChecks",\n        icon: Receipt,\n        perms: ["transaction.read"],\n        feature: "transaction",\n      },`,
      `      {\n        segment: "/checkout",\n        labelKey: "nav.guestChecks",\n        icon: Receipt,\n        perms: ["transaction.read"],\n        feature: "transaction",\n      },\n      {\n        segment: "/my-shift",\n        labelKey: "nav.myShift",\n        icon: CircleDollarSign,\n        perms: ["cash.open", "cash.movement", "cash.close"],\n      },`,
      'My Shift nav',
    );
  }
  if (!source.includes('segment: "/shift-reports"')) {
    source = replaceOnce(
      source,
      `      {\n        segment: "/finance",\n        labelKey: "nav.finance",\n        icon: Wallet,\n        perms: ["transaction.read"],\n        feature: "transaction",\n      },`,
      `      {\n        segment: "/finance",\n        labelKey: "nav.finance",\n        icon: Wallet,\n        perms: ["transaction.read"],\n        feature: "transaction",\n      },\n      {\n        segment: "/shift-reports",\n        labelKey: "nav.shiftReports",\n        icon: CircleDollarSign,\n        perms: ["cash.view_expected"],\n      },`,
      'Shift Reports nav',
    );
  }
  return source;
});

patch('apps/web/src/lib/i18n.ts', (source) => {
  if (source.includes('myShift: "My Shift"')) return source;
  return replaceOnce(
    source,
    '    guestChecks: "Checkout",\n',
    '    guestChecks: "Checkout",\n    myShift: "My Shift",\n    shiftReports: "Shift Reports",\n',
    'cash nav i18n',
  );
});
