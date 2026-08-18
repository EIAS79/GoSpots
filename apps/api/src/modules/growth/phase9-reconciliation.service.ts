import { Injectable } from '@nestjs/common';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { accountExpired } from './phase9.rules';

type Issue = {
  type: string;
  entityId?: string;
  paymentId?: string | null;
  expected?: unknown;
  actual?: unknown;
};

function decimalMajorToMinor(value: { toFixed(scale: number): string }): number {
  const text = value.toFixed(2);
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = '00'] = unsigned.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
  const signed = negative ? -minor : minor;
  const number = Number(signed);
  if (!Number.isSafeInteger(number)) throw new Error('Payment amount exceeds safe minor-unit range.');
  return number;
}

@Injectable()
export class Phase9ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async reconcile(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const [
      storedAccounts,
      storedEntries,
      storedPolicies,
      packageAccounts,
      packageEntries,
      packageDefinitions,
      loyaltyEntries,
      membershipEntries,
    ] = await Promise.all([
      this.prisma.storedValueAccount.findMany({ where: { shopId } }),
      this.prisma.storedValueLedgerEntry.findMany({ where: { shopId } }),
      this.prisma.storedValueAccountPolicy.findMany({ where: { shopId } }),
      this.prisma.customerPackageAccount.findMany({ where: { shopId } }),
      this.prisma.customerPackageLedgerEntry.findMany({ where: { shopId } }),
      this.prisma.packageDefinition.findMany({ where: { shopId } }),
      this.prisma.loyaltyLedgerEntry.findMany({ where: { shopId } }),
      this.prisma.membershipUsageLedgerEntry.findMany({ where: { shopId } }),
    ]);

    const paymentIds = [
      ...new Set(
        [...storedEntries, ...packageEntries]
          .map((row) => row.paymentId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const payments = paymentIds.length
      ? await this.prisma.payment.findMany({
          where: { shopId, id: { in: paymentIds } },
          select: { id: true, status: true, amount: true, currency: true },
        })
      : [];
    const paymentById = new Map(payments.map((row) => [row.id, row]));
    const storedPolicyByAccount = new Map(storedPolicies.map((row) => [row.accountId, row]));
    const packageById = new Map(packageDefinitions.map((row) => [row.id, row]));
    const packageAccountById = new Map(packageAccounts.map((row) => [row.id, row]));
    const issues: Issue[] = [];

    const storedBalances = storedAccounts.map((account) => {
      const rows = storedEntries.filter((row) => row.accountId === account.id);
      const balanceMinor = rows.reduce((sum, row) => sum + row.amountMinor, 0);
      if (balanceMinor < 0) {
        issues.push({ type: 'STORED_VALUE_NEGATIVE_BALANCE', entityId: account.id, actual: balanceMinor });
      }
      const policy = storedPolicyByAccount.get(account.id);
      if (balanceMinor > 0 && accountExpired(policy?.expiresAt)) {
        issues.push({
          type: 'STORED_VALUE_EXPIRED_POSITIVE_LIABILITY',
          entityId: account.id,
          actual: balanceMinor,
        });
      }
      return { accountId: account.id, currency: account.currency, balanceMinor };
    });

    const storedPaymentClaims = new Map<string, string[]>();
    for (const row of storedEntries.filter(
      (entry) => entry.type === 'LOAD' && entry.sourceType !== 'TRANSFER',
    )) {
      if (!row.paymentId) {
        issues.push({ type: 'STORED_VALUE_LOAD_MISSING_PAYMENT', entityId: row.id });
        continue;
      }
      storedPaymentClaims.set(row.paymentId, [
        ...(storedPaymentClaims.get(row.paymentId) ?? []),
        row.id,
      ]);
      const payment = paymentById.get(row.paymentId);
      if (!payment || payment.status !== 'SUCCESS') {
        issues.push({
          type: 'STORED_VALUE_LOAD_PAYMENT_NOT_SUCCESSFUL',
          entityId: row.id,
          paymentId: row.paymentId,
          actual: payment?.status ?? 'MISSING',
        });
        continue;
      }
      if (payment.currency !== row.currency) {
        issues.push({
          type: 'STORED_VALUE_LOAD_CURRENCY_MISMATCH',
          entityId: row.id,
          paymentId: row.paymentId,
          expected: row.currency,
          actual: payment.currency,
        });
      }
      const paidMinor = decimalMajorToMinor(payment.amount);
      if (paidMinor !== row.amountMinor) {
        issues.push({
          type: 'STORED_VALUE_LOAD_AMOUNT_MISMATCH',
          entityId: row.id,
          paymentId: row.paymentId,
          expected: row.amountMinor,
          actual: paidMinor,
        });
      }
    }

    const packageBalances = packageAccounts.map((account) => {
      const rows = packageEntries.filter((row) => row.accountId === account.id);
      const balanceUnits = rows.reduce((sum, row) => sum + row.units, 0);
      if (balanceUnits < 0) {
        issues.push({ type: 'PACKAGE_NEGATIVE_BALANCE', entityId: account.id, actual: balanceUnits });
      }
      if (balanceUnits > 0 && accountExpired(account.expiresAt)) {
        issues.push({ type: 'PACKAGE_EXPIRED_POSITIVE_BALANCE', entityId: account.id, actual: balanceUnits });
      }
      return { accountId: account.id, unitKind: account.unitKind, balanceUnits };
    });

    const packagePaymentClaims = new Map<string, string[]>();
    for (const row of packageEntries.filter((entry) => entry.type === 'LOAD')) {
      if (!row.paymentId) {
        issues.push({ type: 'PACKAGE_LOAD_MISSING_PAYMENT', entityId: row.id });
        continue;
      }
      packagePaymentClaims.set(row.paymentId, [
        ...(packagePaymentClaims.get(row.paymentId) ?? []),
        row.id,
      ]);
      const payment = paymentById.get(row.paymentId);
      const account = packageAccountById.get(row.accountId);
      const definition = account ? packageById.get(account.packageDefinitionId) : undefined;
      if (!payment || payment.status !== 'SUCCESS') {
        issues.push({
          type: 'PACKAGE_LOAD_PAYMENT_NOT_SUCCESSFUL',
          entityId: row.id,
          paymentId: row.paymentId,
          actual: payment?.status ?? 'MISSING',
        });
        continue;
      }
      if (!definition) {
        issues.push({ type: 'PACKAGE_DEFINITION_MISSING', entityId: row.accountId });
        continue;
      }
      if (payment.currency !== definition.currency) {
        issues.push({
          type: 'PACKAGE_LOAD_CURRENCY_MISMATCH',
          entityId: row.id,
          paymentId: row.paymentId,
          expected: definition.currency,
          actual: payment.currency,
        });
      }
      const paidMinor = decimalMajorToMinor(payment.amount);
      if (paidMinor !== definition.priceMinor) {
        issues.push({
          type: 'PACKAGE_LOAD_AMOUNT_MISMATCH',
          entityId: row.id,
          paymentId: row.paymentId,
          expected: definition.priceMinor,
          actual: paidMinor,
        });
      }
    }

    for (const paymentId of storedPaymentClaims.keys()) {
      if (packagePaymentClaims.has(paymentId)) {
        issues.push({
          type: 'VALUE_PAYMENT_REUSED_ACROSS_DOMAINS',
          paymentId,
          expected: 'one value load authority per payment reference',
          actual: {
            storedValueEntries: storedPaymentClaims.get(paymentId),
            packageEntries: packagePaymentClaims.get(paymentId),
          },
        });
      }
    }

    const loyaltyByCustomer = new Map<string, number>();
    for (const row of loyaltyEntries) {
      loyaltyByCustomer.set(
        row.customerId,
        (loyaltyByCustomer.get(row.customerId) ?? 0) + row.points,
      );
    }
    for (const [customerId, balance] of loyaltyByCustomer) {
      if (balance < 0) {
        issues.push({ type: 'LOYALTY_NEGATIVE_BALANCE', entityId: customerId, actual: balance });
      }
    }

    const membershipBenefitBalances = new Map<string, number>();
    for (const row of membershipEntries) {
      const key = `${row.membershipId}:${row.benefitKey}`;
      membershipBenefitBalances.set(key, (membershipBenefitBalances.get(key) ?? 0) + row.units);
    }
    for (const [key, balance] of membershipBenefitBalances) {
      if (balance < 0) {
        issues.push({ type: 'MEMBERSHIP_BENEFIT_NEGATIVE_BALANCE', entityId: key, actual: balance });
      }
    }

    const storedLiabilityByCurrency = new Map<string, number>();
    for (const row of storedBalances) {
      storedLiabilityByCurrency.set(
        row.currency,
        (storedLiabilityByCurrency.get(row.currency) ?? 0) + Math.max(0, row.balanceMinor),
      );
    }

    return {
      ok: issues.length === 0,
      storedValue: {
        balances: storedBalances,
        liabilityByCurrency: Object.fromEntries(storedLiabilityByCurrency),
      },
      packages: { balances: packageBalances },
      loyalty: { balancesByCustomer: Object.fromEntries(loyaltyByCustomer) },
      membershipBenefits: { balances: Object.fromEntries(membershipBenefitBalances) },
      promotions: {
        redemptionCount: await this.prisma.promotionRedemption.count({ where: { shopId } }),
      },
      issues,
    };
  }
}
