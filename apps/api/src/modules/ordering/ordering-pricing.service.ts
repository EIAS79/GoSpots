import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderLineInputDto } from './dto/ordering.dto';

type Db = PrismaService | Prisma.TransactionClient | PrismaClient;

export function calculateLineTotals(input: { unitBaseMinor: number; variantMinor: number; modifierMinor: number; quantity: number; taxRateBps: number }) {
  const unitPriceMinor = input.unitBaseMinor + input.variantMinor + input.modifierMinor;
  const subtotalMinor = unitPriceMinor * input.quantity;
  const taxMinor = Math.round((subtotalMinor * input.taxRateBps) / 10000);
  return { unitPriceMinor, subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor };
}

@Injectable()
export class OrderingPricingService {
  constructor(private readonly prisma: PrismaService) {}

  async priceLine(shopId: string, input: OrderLineInputDto, db: Db = this.prisma) {
    const item = await db.menuItem.findFirst({ where: { id: input.menuItemId, shopId } });
    if (!item) throw new NotFoundException('Menu item not found.');
    const variant = input.variantId
      ? await db.menuItemVariant.findFirst({ where: { id: input.variantId, shopId, menuItemId: item.id, active: true } })
      : null;
    if (input.variantId && !variant) throw new BadRequestException('Variant is not valid for this menu item.');

    const links = await db.menuItemModifierGroup.findMany({ where: { shopId, menuItemId: item.id }, orderBy: { sortOrder: 'asc' } });
    const groupIds = links.map((l) => l.modifierGroupId);
    const groups = groupIds.length ? await db.menuModifierGroup.findMany({ where: { shopId, id: { in: groupIds }, active: true } }) : [];
    const selectedIds = [...new Set(input.modifierIds ?? [])];
    const modifiers = selectedIds.length ? await db.menuModifier.findMany({ where: { shopId, id: { in: selectedIds }, active: true } }) : [];
    if (modifiers.length !== selectedIds.length) throw new BadRequestException('One or more modifiers are invalid.');
    if (modifiers.some((m) => !groupIds.includes(m.groupId))) throw new BadRequestException('Modifier is not available for this item.');
    for (const group of groups) {
      const count = modifiers.filter((m) => m.groupId === group.id).length;
      const min = group.required ? Math.max(1, group.minSelect) : group.minSelect;
      if (count < min || count > group.maxSelect) throw new BadRequestException(`Modifier selection for ${group.name} must be between ${min} and ${group.maxSelect}.`);
    }
    const profile = await db.menuItemCommerceProfile.findUnique({ where: { shopId_menuItemId: { shopId, menuItemId: item.id } } });
    const unitBaseMinor = Math.max(0, Math.round(Number(item.price) * 100));
    const variantMinor = variant?.priceDeltaMinor ?? 0;
    const modifierMinor = modifiers.reduce((sum, m) => sum + m.priceDeltaMinor, 0);
    const totals = calculateLineTotals({ unitBaseMinor, variantMinor, modifierMinor, quantity: input.quantity, taxRateBps: profile?.taxRateBps ?? 0 });
    return {
      ...totals,
      menuItemId: item.id,
      variantId: variant?.id ?? null,
      quantity: input.quantity,
      seat: input.seat ?? null,
      nameSnapshot: item.name,
      variantNameSnapshot: variant?.name ?? null,
      unitBaseMinor,
      variantMinor,
      modifierMinor,
      taxCategorySnapshot: profile?.taxCategoryKey ?? null,
      taxRateBps: profile?.taxRateBps ?? 0,
      prepRouteKey: profile?.prepRouteKey ?? null,
      recipeKey: profile?.recipeKey ?? null,
      modifiers: modifiers.map((m) => ({ id: m.id, name: m.name, priceDeltaMinor: m.priceDeltaMinor })),
      priceSnapshot: {
        menuItem: { id: item.id, name: item.name, baseMinor: unitBaseMinor },
        variant: variant ? { id: variant.id, name: variant.name, deltaMinor: variantMinor } : null,
        modifiers: modifiers.map((m) => ({ id: m.id, name: m.name, deltaMinor: m.priceDeltaMinor })),
        tax: { category: profile?.taxCategoryKey ?? null, rateBps: profile?.taxRateBps ?? 0 },
        prepRouteKey: profile?.prepRouteKey ?? null,
        recipeKey: profile?.recipeKey ?? null,
        capturedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    };
  }
}
