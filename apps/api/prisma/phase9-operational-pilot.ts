import { createHash } from 'node:crypto';
import { AuditService } from '../src/modules/audit/audit.service';
import type { JwtAccessPayload } from '../src/modules/auth/auth.service';
import { GrowthCrmService } from '../src/modules/growth/growth-crm.service';
import { GrowthPricingService } from '../src/modules/growth/growth-pricing.service';
import { Phase9CustomerPortalService } from '../src/modules/growth/phase9-customer-portal.service';
import { Phase9CustomerValueService } from '../src/modules/growth/phase9-customer-value.service';
import { Phase9GuardrailsService } from '../src/modules/growth/phase9-guardrails.service';
import { Phase9LoyaltyExpiryService } from '../src/modules/growth/phase9-loyalty-expiry.service';
import { PrismaService } from '../src/prisma/prisma.service';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`PHASE9_PILOT: ${message}`);
}

function fulfilledCount(rows: PromiseSettledResult<unknown>[]) {
  return rows.filter((row) => row.status === 'fulfilled').length;
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const audit = new AuditService(prisma);
  const pricing = new GrowthPricingService(prisma, audit);
  const crm = new GrowthCrmService(prisma, audit);
  const expiry = new Phase9LoyaltyExpiryService(prisma);
  const phase9 = new Phase9CustomerValueService(prisma, audit, pricing);
  const guardrails = new Phase9GuardrailsService(prisma, expiry);
  const portal = new Phase9CustomerPortalService(prisma, audit, expiry);
  const prefix = `p9pilot_${Date.now()}`;
  const userId = `${prefix}_user`;
  const otherUserId = `${prefix}_other_user`;
  const shopId = `${prefix}_shop`;
  const otherShopId = `${prefix}_other_shop`;
  const actor: JwtAccessPayload = {
    sub: userId,
    shopId,
    sysRole: 'USER',
    shopRole: 'OWNER',
    email: `${prefix}@gospots.invalid`,
  };
  const otherActor: JwtAccessPayload = {
    sub: otherUserId,
    shopId: otherShopId,
    sysRole: 'USER',
    shopRole: 'OWNER',
    email: `${prefix}_other@gospots.invalid`,
  };

  try {
    await prisma.user.create({
      data: { id: userId, email: actor.email!, name: 'Phase 9 Pilot', passwordHash: 'x' },
    });
    await prisma.user.create({
      data: { id: otherUserId, email: otherActor.email!, name: 'Phase 9 Other', passwordHash: 'x' },
    });
    await prisma.shop.create({
      data: {
        id: shopId,
        name: 'Phase 9 Pilot',
        slug: prefix,
        dashboardKey: `${prefix}_key`,
        ownerId: userId,
        currency: 'PLN',
        timezone: 'Europe/Warsaw',
      },
    });
    await prisma.shop.create({
      data: {
        id: otherShopId,
        name: 'Phase 9 Other',
        slug: `${prefix}_other`,
        dashboardKey: `${prefix}_other_key`,
        ownerId: otherUserId,
        currency: 'PLN',
        timezone: 'Europe/Warsaw',
      },
    });

    const anonymous = await phase9.createAnonymousCustomer(actor, { name: 'Walk-in' });
    assert(!anonymous.email && !anonymous.phone, 'ordinary anonymous customer still required identity data');

    const canonical = await crm.createCustomer(actor, {
      name: 'Canonical Member',
      email: `${prefix}.member@gospots.invalid`,
      marketingConsent: true,
      consentSource: 'PILOT_IMPORT',
    });
    await phase9.ensureConsentProvenance(actor, canonical.id);
    await phase9.setPreference(actor, canonical.id, 'preferred-table', 'Table 3' as never);
    assert(
      (await prisma.customerConsentEvent.count({ where: { shopId, customerId: canonical.id } })) === 1,
      'legacy consent was not preserved as provenance evidence',
    );

    const duplicate = await crm.createCustomer(actor, {
      name: 'Duplicate Member',
      email: `${prefix}.duplicate@gospots.invalid`,
      marketingConsent: true,
      consentSource: 'CUSTOMER_FORM',
    });
    await phase9.ensureConsentProvenance(actor, duplicate.id);
    await phase9.setPreference(actor, duplicate.id, 'cue-side', 'right' as never);
    await crm.mergeCustomer(actor, canonical.id, {
      mergedCustomerId: duplicate.id,
      reason: 'Phase 9 pilot dedupe',
    });
    await phase9.finalizeCustomerMerge(actor, canonical.id, duplicate.id);
    assert(
      (await prisma.customerConsentEvent.count({ where: { shopId, customerId: canonical.id } })) === 2,
      'customer merge lost consent provenance',
    );
    assert(
      (await prisma.customerPreference.count({ where: { shopId, customerId: canonical.id } })) === 2,
      'customer merge lost preferences',
    );

    let tenantBlocked = false;
    try {
      await phase9.customerValueSummary(otherActor, canonical.id);
    } catch (error) {
      tenantBlocked = String(error).includes('Customer not found');
    }
    assert(tenantBlocked, 'cross-tenant customer lookup was not rejected');

    const tier = await crm.createTier(actor, {
      name: 'Off Peak Club',
      code: `${prefix}_club`,
      rank: 10,
      benefits: { includedHours: 2, memberRate: true },
    });
    await crm.enroll(actor, canonical.id, {
      tierId: tier.id,
      expiresAt: '2031-01-01T00:00:00.000Z',
    });
    await phase9.recordMembershipEnrollment(actor, canonical.id);
    const included = await prisma.membershipUsageLedgerEntry.findFirst({
      where: { shopId, customerId: canonical.id, benefitKey: 'includedHours' },
    });
    assert(included?.units === 120, 'membership included hours were not ledger-granted in minutes');
    const memberSpend = await Promise.allSettled([
      phase9.membershipUsage(actor, canonical.id, {
        type: 'CONSUME',
        benefitKey: 'includedHours',
        unitKind: 'MINUTES',
        units: 90,
        correlationId: `${prefix}-member-use-a`,
      }),
      phase9.membershipUsage(actor, canonical.id, {
        type: 'CONSUME',
        benefitKey: 'includedHours',
        unitKind: 'MINUTES',
        units: 90,
        correlationId: `${prefix}-member-use-b`,
      }),
    ]);
    assert(fulfilledCount(memberSpend) === 1, 'membership benefit concurrent redemption double-spent');

    const normalizedMemberQuote = await guardrails.normalizeQuote(actor, {
      subtotalMinor: 1000,
      context: { customerId: canonical.id, isMember: false },
    });
    assert(normalizedMemberQuote.context?.isMember === true, 'member status was not derived server-side');
    const normalizedAnonymousQuote = await guardrails.normalizeQuote(actor, {
      subtotalMinor: 1000,
      context: { customerId: anonymous.id, isMember: true },
    });
    assert(normalizedAnonymousQuote.context?.isMember === false, 'client spoofed member status was trusted');

    await phase9.setLoyaltyPolicy(actor, { pointsExpireDays: 1 });
    const earn = await phase9.loyalty(actor, canonical.id, {
      type: 'EARN',
      points: 100,
      sourceType: 'GUEST_CHECK',
      sourceId: `${prefix}-sale`,
      correlationId: `${prefix}-earn-100`,
    });
    const replay = await phase9.loyalty(actor, canonical.id, {
      type: 'EARN',
      points: 100,
      sourceType: 'GUEST_CHECK',
      sourceId: `${prefix}-sale`,
      correlationId: `${prefix}-earn-100`,
    });
    assert(earn.entry.id === replay.entry.id, 'same loyalty request did not replay deterministically');
    let loyaltyConflict = false;
    try {
      await phase9.loyalty(actor, canonical.id, {
        type: 'EARN',
        points: 101,
        sourceType: 'GUEST_CHECK',
        sourceId: `${prefix}-sale`,
        correlationId: `${prefix}-earn-100`,
      });
    } catch (error) {
      loyaltyConflict = String(error).includes('different request payload');
    }
    assert(loyaltyConflict, 'loyalty idempotency key accepted a changed payload');
    const loyaltyRace = await Promise.allSettled([
      phase9.loyalty(actor, canonical.id, {
        type: 'REDEEM',
        points: 80,
        correlationId: `${prefix}-redeem-a`,
      }),
      phase9.loyalty(actor, canonical.id, {
        type: 'REDEEM',
        points: 80,
        correlationId: `${prefix}-redeem-b`,
      }),
    ]);
    assert(fulfilledCount(loyaltyRace) === 1, 'loyalty concurrent redemption double-spent');

    const expiryCustomer = await crm.createCustomer(actor, {
      name: 'Expiry Customer',
      email: `${prefix}.expiry@gospots.invalid`,
    });
    const expiryEarn = await phase9.loyalty(actor, expiryCustomer.id, {
      type: 'EARN',
      points: 25,
      correlationId: `${prefix}-expiry-earn`,
    });
    await prisma.loyaltyEntryPolicyEvidence.update({
      where: { ledgerEntryId: expiryEarn.entry.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expired = await expiry.processDue(shopId, expiryCustomer.id, userId);
    assert(expired.expiredPoints === 25, 'due loyalty points were not materialized as expiry facts');

    const check = await prisma.guestCheck.create({
      data: { shopId, guestName: 'Phase 9 Buyer', currency: 'PLN', createdById: userId },
    });
    const settlement = await prisma.checkSettlement.create({
      data: {
        shopId,
        guestCheckId: check.id,
        checkVersion: 1,
        sourceHash: createHash('sha256').update(`${prefix}-payment`).digest('hex'),
        subtotal: '100.00',
        total: '100.00',
        amountDue: '0.00',
        currency: 'PLN',
        state: 'PAID',
        createdById: userId,
      },
    });
    const payment = await prisma.payment.create({
      data: {
        shopId,
        settlementId: settlement.id,
        method: 'MANUAL_CARD',
        status: 'SUCCESS',
        amount: '100.00',
        currency: 'PLN',
        createdById: userId,
        correlationId: `${prefix}-payment`,
        succeededAt: new Date(),
      },
    });

    const walletA = await crm.createStoredAccount(actor, { customerId: canonical.id, currency: 'PLN' });
    const walletB = await crm.createStoredAccount(actor, { customerId: canonical.id, currency: 'PLN' });
    await phase9.configureStoredValuePolicy(actor, walletA.account.id, { transferAllowed: true });
    await phase9.configureStoredValuePolicy(actor, walletB.account.id, {});
    const load = await phase9.storedValue(actor, walletA.account.id, {
      type: 'LOAD',
      amountMinor: 5000,
      paymentId: payment.id,
      correlationId: `${prefix}-wallet-load`,
    });
    const loadReplay = await phase9.storedValue(actor, walletA.account.id, {
      type: 'LOAD',
      amountMinor: 5000,
      paymentId: payment.id,
      correlationId: `${prefix}-wallet-load`,
    });
    assert(load.entry.id === loadReplay.entry.id, 'stored-value load did not replay deterministically');
    let storedConflict = false;
    try {
      await phase9.storedValue(actor, walletA.account.id, {
        type: 'LOAD',
        amountMinor: 5001,
        paymentId: payment.id,
        correlationId: `${prefix}-wallet-load`,
      });
    } catch (error) {
      storedConflict = String(error).includes('different request payload');
    }
    assert(storedConflict, 'stored-value idempotency key accepted changed payload');
    const storedRace = await Promise.allSettled([
      phase9.storedValue(actor, walletA.account.id, {
        type: 'REDEEM',
        amountMinor: 4000,
        correlationId: `${prefix}-wallet-redeem-a`,
      }),
      phase9.storedValue(actor, walletA.account.id, {
        type: 'REDEEM',
        amountMinor: 4000,
        correlationId: `${prefix}-wallet-redeem-b`,
      }),
    ]);
    assert(fulfilledCount(storedRace) === 1, 'stored-value concurrent redemption double-spent');
    const transfer = await phase9.transferStoredValue(actor, walletA.account.id, {
      destinationAccountId: walletB.account.id,
      amountMinor: 500,
      correlationId: `${prefix}-wallet-transfer`,
    });
    assert(transfer.sourceBalanceMinor === 500, 'stored-value transfer source balance is wrong');
    assert(transfer.destinationBalanceMinor === 500, 'stored-value transfer destination balance is wrong');
    const reconciliation = await guardrails.reconcileStoredValue(actor);
    assert(reconciliation.ok, 'stored-value reconciliation reported a silent discrepancy');

    const packageDefinition = await pricing.createPackage(actor, {
      name: '10 billiard hours',
      priceMinor: 10000,
      currency: 'PLN',
      components: [{ unitKind: 'HOURS', quantity: 10 }],
    });
    const packageAccount = await phase9.createPackageAccount(actor, {
      customerId: canonical.id,
      packageDefinitionId: packageDefinition.id,
      unitKind: 'HOURS',
      initialUnits: 10,
      paymentId: payment.id,
      correlationId: `${prefix}-package-buy`,
    });
    const packageRace = await Promise.allSettled([
      phase9.packageMutation(actor, packageAccount.account.id, {
        type: 'CONSUME',
        units: 7,
        correlationId: `${prefix}-package-use-a`,
      }),
      phase9.packageMutation(actor, packageAccount.account.id, {
        type: 'CONSUME',
        units: 7,
        correlationId: `${prefix}-package-use-b`,
      }),
    ]);
    assert(fulfilledCount(packageRace) === 1, 'prepaid package concurrent redemption double-spent');

    const promo = await pricing.createPromotion(actor, {
      code: `${prefix}_FIRST`,
      name: 'First visit 10%',
      kind: 'PERCENT',
      valueBps: 1000,
      requiresCode: true,
      conditions: [{ kind: 'CUSTOMER', operator: 'EQ', value: canonical.id }],
    });
    await phase9.setPromotionUsagePolicy(actor, promo.id, {
      totalLimit: 1,
      perCustomerLimit: 1,
    });
    const quoteInput = await guardrails.normalizeQuote(actor, {
      subtotalMinor: 1000,
      promotionCodes: [`${prefix}_FIRST`],
      context: { customerId: canonical.id },
    });
    const quoted = await pricing.quote(actor, quoteInput);
    await phase9.assertPromotionPolicies(actor, quoteInput, quoted);
    assert(quoted.discountMinor === 100, 'promotion did not apply deterministically');
    await phase9.snapshotWithUsagePolicies(actor, {
      ...quoteInput,
      sourceType: 'PILOT',
      sourceId: `${prefix}-promo-1`,
    });
    let promoLimitBlocked = false;
    try {
      await phase9.snapshotWithUsagePolicies(actor, {
        ...quoteInput,
        sourceType: 'PILOT',
        sourceId: `${prefix}-promo-2`,
      });
    } catch (error) {
      promoLimitBlocked = String(error).includes('TOTAL_USAGE_LIMIT_REACHED');
    }
    assert(promoLimitBlocked, 'promotion usage limit did not block a second redemption');

    const issuedPortal = await phase9.issuePortalToken(actor, canonical.id, 30);
    const portalView = await portal.snapshot(issuedPortal.token);
    assert(portalView.customer.id === canonical.id, 'customer portal projected the wrong customer');
    assert(portalView.membership?.effectiveStatus === 'ACTIVE', 'customer portal lost membership state');
    assert(portalView.storedValue.length === 2, 'customer portal did not project stored value');
    await portal.setMarketingConsent(issuedPortal.token, false);
    assert(
      (await prisma.customerProfile.findUnique({ where: { id: canonical.id } }))?.marketingConsentAt === null,
      'customer portal could not revoke consent',
    );

    console.log(
      `PHASE9_OPERATIONAL_PILOT=PASS customer=${canonical.id} membership=${tier.id} wallet=${walletA.account.id} package=${packageAccount.account.id} promo=${promo.id}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});