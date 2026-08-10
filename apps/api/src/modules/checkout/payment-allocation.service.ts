import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PaymentAllocationKind, Prisma } from '@prisma/client';
import {
  roundMoneyDecimal,
  serializeMoney,
  sumMoneyDecimal,
  toPrismaDecimal,
  type MoneyInput,
} from '../../common/money.util';

export type AllocationSnapshotInput = {
  id: string;
  position: number;
  sourceType: string;
  sourceId: string;
  lineReference: string | null;
  description: string;
  quantity: number;
  finalAmount: MoneyInput;
  allocatedAmount?: MoneyInput;
  currency: string;
};

export type RemainingAllocationSnapshot = AllocationSnapshotInput & {
  finalAmountDecimal: Prisma.Decimal;
  allocatedAmountDecimal: Prisma.Decimal;
  remainingAmountDecimal: Prisma.Decimal;
};

export type PaymentAllocationPreviewPart = {
  snapshotId: string;
  sourceType: string;
  sourceId: string;
  lineReference: string | null;
  description: string;
  amount: string;
  quantity: string;
};

export type PaymentGroupPreview = {
  key: string;
  label: string;
  allocationKind: PaymentAllocationKind;
  amount: string;
  currency: string;
  allocations: PaymentAllocationPreviewPart[];
};

export type PaymentGroupPreviewResult = {
  allocationKind: PaymentAllocationKind;
  currency: string;
  remainingTotal: string;
  groups: PaymentGroupPreview[];
};

function minDecimal(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.lte(b) ? a : b;
}

@Injectable()
export class PaymentAllocationService {
  buildRemainingSnapshots(
    snapshots: readonly AllocationSnapshotInput[],
  ): RemainingAllocationSnapshot[] {
    const currencies = new Set(snapshots.map((row) => row.currency));
    if (currencies.size > 1) {
      throw new ConflictException(
        'Settlement snapshots contain multiple currencies',
      );
    }

    return snapshots
      .map((row) => {
        const finalAmountDecimal = roundMoneyDecimal(row.finalAmount, 4);
        const allocatedAmountDecimal = roundMoneyDecimal(
          row.allocatedAmount ?? 0,
          4,
        );
        if (allocatedAmountDecimal.isNegative()) {
          throw new ConflictException('Allocated amount cannot be negative');
        }
        if (allocatedAmountDecimal.gt(finalAmountDecimal)) {
          throw new ConflictException(
            `Existing allocations exceed charge snapshot ${row.id}`,
          );
        }
        return {
          ...row,
          finalAmountDecimal,
          allocatedAmountDecimal,
          remainingAmountDecimal: finalAmountDecimal.sub(
            allocatedAmountDecimal,
          ),
        };
      })
      .filter((row) => row.remainingAmountDecimal.gt(0))
      .sort((a, b) => a.position - b.position);
  }

  previewGroups(
    mode: PaymentAllocationKind,
    snapshots: readonly AllocationSnapshotInput[],
    options: {
      parts?: number;
      percentage?: number;
      customAmounts?: readonly string[];
    } = {},
  ): PaymentGroupPreviewResult {
    const rows = this.buildRemainingSnapshots(snapshots);
    if (rows.length === 0) {
      throw new BadRequestException('Settlement has no remaining amount to split');
    }
    const currency = rows[0].currency;
    const total = sumMoneyDecimal(
      ...rows.map((row) => row.remainingAmountDecimal),
    );

    let groups: PaymentGroupPreview[];
    switch (mode) {
      case PaymentAllocationKind.LINE:
        groups = rows.map((row, index) =>
          this.makeGroup(
            `line:${row.id}`,
            row.description || `Item ${index + 1}`,
            mode,
            currency,
            [this.fullPart(row)],
          ),
        );
        break;

      case PaymentAllocationKind.SOURCE:
        groups = this.bySource(rows, currency);
        break;

      case PaymentAllocationKind.EQUAL:
        groups = this.equalGroups(rows, currency, options.parts);
        break;

      case PaymentAllocationKind.PERCENTAGE:
        groups = this.percentageGroup(
          rows,
          currency,
          total,
          options.percentage,
        );
        break;

      case PaymentAllocationKind.CUSTOM:
        groups = this.customGroups(rows, currency, options.customAmounts);
        break;

      case PaymentAllocationKind.REMAINING:
        groups = [
          this.makeGroup(
            'remaining',
            'Remaining balance',
            mode,
            currency,
            rows.map((row) => this.fullPart(row)),
          ),
        ];
        break;

      default:
        throw new BadRequestException(`Unsupported split mode: ${String(mode)}`);
    }

    const groupedTotal = sumMoneyDecimal(
      ...groups.map((group) => group.amount),
    );
    if (groupedTotal.gt(total)) {
      throw new ConflictException('Generated payment groups exceed amount due');
    }

    return {
      allocationKind: mode,
      currency,
      remainingTotal: serializeMoney(total),
      groups,
    };
  }

  private bySource(
    rows: readonly RemainingAllocationSnapshot[],
    currency: string,
  ): PaymentGroupPreview[] {
    const grouped = new Map<string, RemainingAllocationSnapshot[]>();
    for (const row of rows) {
      const key = `${row.sourceType}:${row.sourceId}`;
      const existing = grouped.get(key) ?? [];
      existing.push(row);
      grouped.set(key, existing);
    }
    return [...grouped.entries()].map(([key, sourceRows]) => {
      const first = sourceRows[0];
      const label =
        sourceRows.length === 1
          ? first.description
          : `${first.sourceType.replaceAll('_', ' ')} · ${sourceRows.length} items`;
      return this.makeGroup(
        `source:${key}`,
        label,
        PaymentAllocationKind.SOURCE,
        currency,
        sourceRows.map((row) => this.fullPart(row)),
      );
    });
  }

  private equalGroups(
    rows: readonly RemainingAllocationSnapshot[],
    currency: string,
    parts: number | undefined,
  ): PaymentGroupPreview[] {
    if (!Number.isInteger(parts) || (parts ?? 0) < 2 || (parts ?? 0) > 20) {
      throw new BadRequestException('Equal split requires 2 to 20 parts');
    }
    const count = parts as number;
    const total = sumMoneyDecimal(
      ...rows.map((row) => row.remainingAmountDecimal),
    );
    const base = roundMoneyDecimal(total.div(count), 4);
    if (base.lte(0)) {
      throw new BadRequestException('Amount due is too small for equal split');
    }

    const balances = new Map(
      rows.map((row) => [row.id, row.remainingAmountDecimal] as const),
    );
    const groups: PaymentGroupPreview[] = [];
    let assigned = new Prisma.Decimal(0);
    for (let index = 0; index < count; index += 1) {
      const target =
        index === count - 1 ? total.sub(assigned) : minDecimal(base, total.sub(assigned));
      if (target.lte(0)) {
        throw new BadRequestException('Amount due is too small for equal split');
      }
      const allocations = this.allocateSequential(rows, balances, target);
      groups.push(
        this.makeGroup(
          `equal:${index + 1}`,
          `Part ${index + 1} of ${count}`,
          PaymentAllocationKind.EQUAL,
          currency,
          allocations,
        ),
      );
      assigned = assigned.add(target);
    }
    return groups;
  }

  private percentageGroup(
    rows: readonly RemainingAllocationSnapshot[],
    currency: string,
    total: Prisma.Decimal,
    percentage: number | undefined,
  ): PaymentGroupPreview[] {
    if (
      typeof percentage !== 'number' ||
      !Number.isFinite(percentage) ||
      percentage <= 0 ||
      percentage > 100
    ) {
      throw new BadRequestException('Percentage must be greater than 0 and at most 100');
    }
    const target = roundMoneyDecimal(
      total.mul(toPrismaDecimal(String(percentage))).div(100),
      4,
    );
    if (target.lte(0)) {
      throw new BadRequestException('Percentage produces a zero payment amount');
    }
    const balances = new Map(
      rows.map((row) => [row.id, row.remainingAmountDecimal] as const),
    );
    return [
      this.makeGroup(
        `percentage:${percentage}`,
        `${percentage}% of remaining`,
        PaymentAllocationKind.PERCENTAGE,
        currency,
        this.allocateSequential(rows, balances, target),
      ),
    ];
  }

  private customGroups(
    rows: readonly RemainingAllocationSnapshot[],
    currency: string,
    customAmounts: readonly string[] | undefined,
  ): PaymentGroupPreview[] {
    if (!customAmounts?.length) {
      throw new BadRequestException('Custom split requires at least one amount');
    }
    const balances = new Map(
      rows.map((row) => [row.id, row.remainingAmountDecimal] as const),
    );
    const total = sumMoneyDecimal(
      ...rows.map((row) => row.remainingAmountDecimal),
    );
    let requested = new Prisma.Decimal(0);
    const groups: PaymentGroupPreview[] = [];
    customAmounts.forEach((raw, index) => {
      const target = roundMoneyDecimal(raw, 4);
      if (target.lte(0)) {
        throw new BadRequestException('Custom split amounts must be greater than zero');
      }
      requested = requested.add(target);
      if (requested.gt(total)) {
        throw new BadRequestException('Custom split exceeds remaining balance');
      }
      groups.push(
        this.makeGroup(
          `custom:${index + 1}`,
          `Custom payment ${index + 1}`,
          PaymentAllocationKind.CUSTOM,
          currency,
          this.allocateSequential(rows, balances, target),
        ),
      );
    });
    return groups;
  }

  private allocateSequential(
    rows: readonly RemainingAllocationSnapshot[],
    balances: Map<string, Prisma.Decimal>,
    targetInput: MoneyInput,
  ): PaymentAllocationPreviewPart[] {
    const target = roundMoneyDecimal(targetInput, 4);
    let needed = target;
    const parts: PaymentAllocationPreviewPart[] = [];

    for (const row of rows) {
      if (needed.lte(0)) break;
      const available = balances.get(row.id) ?? new Prisma.Decimal(0);
      if (available.lte(0)) continue;
      const amount = minDecimal(available, needed);
      if (amount.lte(0)) continue;
      parts.push(this.part(row, amount));
      balances.set(row.id, available.sub(amount));
      needed = needed.sub(amount);
    }

    if (!needed.isZero()) {
      throw new BadRequestException('Requested split exceeds remaining balance');
    }
    return parts;
  }

  private fullPart(
    row: RemainingAllocationSnapshot,
  ): PaymentAllocationPreviewPart {
    return this.part(row, row.remainingAmountDecimal);
  }

  private part(
    row: RemainingAllocationSnapshot,
    amount: Prisma.Decimal,
  ): PaymentAllocationPreviewPart {
    const quantity = row.finalAmountDecimal.gt(0)
      ? roundMoneyDecimal(
          toPrismaDecimal(row.quantity).mul(amount).div(row.finalAmountDecimal),
          4,
        )
      : new Prisma.Decimal(0);
    return {
      snapshotId: row.id,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      lineReference: row.lineReference,
      description: row.description,
      amount: serializeMoney(amount),
      quantity: serializeMoney(quantity),
    };
  }

  private makeGroup(
    key: string,
    label: string,
    allocationKind: PaymentAllocationKind,
    currency: string,
    allocations: PaymentAllocationPreviewPart[],
  ): PaymentGroupPreview {
    const amount = sumMoneyDecimal(...allocations.map((row) => row.amount));
    return {
      key,
      label,
      allocationKind,
      amount: serializeMoney(amount),
      currency,
      allocations,
    };
  }
}
