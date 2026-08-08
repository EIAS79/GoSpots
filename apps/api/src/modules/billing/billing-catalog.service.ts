import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  marketAdjustedCatalogEur,
  monthlyTotal,
  resolvePackId,
  serializeAddOns,
  VENUE_ADD_ON_LIST,
  VENUE_ADD_ONS,
  VENUE_PACK_LIST,
  VENUE_PACKS,
  type AddOnId,
  type VenuePackId,
} from '../../common/venue-packs';
import { normalizeCurrency } from '../../common/locale-currency';
import { CurrencyRatesService } from '../shop/currency-rates.service';

export type CatalogLineItem = {
  kind: 'pack' | 'add_on' | 'seat';
  id: string;
  name: string;
  quantity: number;
  /** Unit price in quoted currency (major units). */
  unitAmount: number;
  /** Line total in quoted currency (major units). */
  amount: number;
  amountMinor: number;
  /** Optional Stripe Price id when STRIPE_PRICE_MAP is configured. */
  stripePriceId?: string | null;
};

export type CatalogQuote = {
  packId: VenuePackId;
  addOnIds: AddOnId[];
  seatQuantity: number;
  currency: string;
  /** Catalog EUR after PPP, before FX. */
  amountEur: number;
  amount: number;
  amountMinor: number;
  lineItems: CatalogLineItem[];
  fxRate: number;
  ratesAt: string;
};

export type CatalogEntry = {
  id: string;
  kind: 'pack' | 'add_on';
  name: string;
  tagline: string;
  monthlyPriceEur: number;
  monthlyPrice: number;
  monthlyPriceMinor: number;
  currency: string;
  pricedPerSeat?: boolean;
  stripePriceId?: string | null;
};

type StripePriceMap = Record<string, string | Record<string, string>>;

function toMinor(amount: number): number {
  return Math.max(0, Math.round(amount * 100));
}

@Injectable()
export class BillingCatalogService {
  constructor(
    private readonly config: ConfigService,
    private readonly rates: CurrencyRatesService,
  ) {}

  /**
   * Optional `STRIPE_PRICE_MAP` JSON.
   * Flat: `{ "gaming_suite": "price_…" }`
   * Or per-currency: `{ "EUR": { "gaming_suite": "price_…" } }`
   */
  resolveStripePriceId(
    itemId: string,
    currency: string,
  ): string | null {
    const map = this.parseStripePriceMap();
    if (!map) return null;
    const code = currency.toUpperCase();
    const nested = map[code];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const id = nested[itemId];
      return typeof id === 'string' && id.trim() ? id.trim() : null;
    }
    const flat = map[itemId];
    return typeof flat === 'string' && flat.trim() ? flat.trim() : null;
  }

  async listCatalog(currency: string): Promise<{
    currency: string;
    packs: CatalogEntry[];
    addOns: CatalogEntry[];
    fxRate: number;
    ratesAt: string;
  }> {
    const code = normalizeCurrency(currency);
    const { rate, ratesAt } = await this.rates.getRate('EUR', code, {
      forceRefresh: false,
    });

    const packs: CatalogEntry[] = VENUE_PACK_LIST.map((pack) => {
      const eur = marketAdjustedCatalogEur(pack.monthlyPrice, code);
      const local = this.rates.convertAmount(eur, rate);
      return {
        id: pack.id,
        kind: 'pack' as const,
        name: pack.name,
        tagline: pack.tagline,
        monthlyPriceEur: eur,
        monthlyPrice: local,
        monthlyPriceMinor: toMinor(local),
        currency: code,
        stripePriceId: this.resolveStripePriceId(`pack:${pack.id}`, code),
      };
    });

    const addOns: CatalogEntry[] = VENUE_ADD_ON_LIST.map((addOn) => {
      const eur = marketAdjustedCatalogEur(addOn.monthlyPrice, code);
      const local = this.rates.convertAmount(eur, rate);
      return {
        id: addOn.id,
        kind: 'add_on' as const,
        name: addOn.name,
        tagline: addOn.tagline,
        monthlyPriceEur: eur,
        monthlyPrice: local,
        monthlyPriceMinor: toMinor(local),
        currency: code,
        pricedPerSeat: addOn.pricedPerSeat,
        stripePriceId: this.resolveStripePriceId(addOn.id, code),
      };
    });

    return { currency: code, packs, addOns, fxRate: rate, ratesAt };
  }

  /**
   * Server-side quote — never trust client prices.
   * Uses venue-packs `monthlyTotal` + `marketAdjustedCatalogEur`, then FX.
   * Checkout deliberately reuses the cached rate when available instead of
   * making the payment path depend on a fresh third-party FX HTTP request.
   */
  async quote(input: {
    packId: string;
    addOnIds: string[];
    seatQuantity?: number;
    currency: string;
  }): Promise<CatalogQuote> {
    const rawPack = String(input.packId ?? '').trim();
    if (!rawPack || !(rawPack in VENUE_PACKS)) {
      throw new BadRequestException(`Unknown pack id: ${rawPack || '(empty)'}`);
    }
    const packId = resolvePackId(rawPack);
    const seats = Math.max(
      0,
      Math.min(100, Math.floor(input.seatQuantity ?? 0)),
    );
    const addOnIds = this.normalizeAddOnIds(input.addOnIds);
    if (addOnIds.includes('team_accounts') && seats < 1) {
      throw new BadRequestException(
        'team_accounts requires seatQuantity of at least 1.',
      );
    }

    const code = normalizeCurrency(input.currency);
    const addOnsCsv = serializeAddOns(addOnIds);
    const amountEur = marketAdjustedCatalogEur(
      monthlyTotal(packId, addOnsCsv, seats),
      code,
    );

    const { rate, ratesAt } = await this.rates.getRate('EUR', code, {
      forceRefresh: false,
    });
    const amount = this.rates.convertAmount(amountEur, rate);
    const amountMinor = toMinor(amount);

    const lineItems: CatalogLineItem[] = [];
    const pack = VENUE_PACK_LIST.find((p) => p.id === packId);
    if (pack) {
      const eur = marketAdjustedCatalogEur(pack.monthlyPrice, code);
      const local = this.rates.convertAmount(eur, rate);
      lineItems.push({
        kind: 'pack',
        id: pack.id,
        name: pack.name,
        quantity: 1,
        unitAmount: local,
        amount: local,
        amountMinor: toMinor(local),
        stripePriceId: this.resolveStripePriceId(`pack:${pack.id}`, code),
      });
    }

    for (const id of addOnIds) {
      const addOn = VENUE_ADD_ONS[id];
      const eurUnit = marketAdjustedCatalogEur(addOn.monthlyPrice, code);
      const unitLocal = this.rates.convertAmount(eurUnit, rate);
      if (addOn.pricedPerSeat) {
        const lineAmount = unitLocal * seats;
        lineItems.push({
          kind: 'seat',
          id,
          name: addOn.name,
          quantity: seats,
          unitAmount: unitLocal,
          amount: lineAmount,
          amountMinor: toMinor(lineAmount),
          stripePriceId: this.resolveStripePriceId(id, code),
        });
      } else {
        lineItems.push({
          kind: 'add_on',
          id,
          name: addOn.name,
          quantity: 1,
          unitAmount: unitLocal,
          amount: unitLocal,
          amountMinor: toMinor(unitLocal),
          stripePriceId: this.resolveStripePriceId(id, code),
        });
      }
    }

    return {
      packId,
      addOnIds,
      seatQuantity: seats,
      currency: code,
      amountEur,
      amount,
      amountMinor,
      lineItems,
      fxRate: rate,
      ratesAt,
    };
  }

  private normalizeAddOnIds(raw: string[]): AddOnId[] {
    const out: AddOnId[] = [];
    const seen = new Set<string>();
    for (const value of raw ?? []) {
      const id = String(value ?? '').trim();
      if (!id || seen.has(id)) continue;
      if (!(id in VENUE_ADD_ONS)) {
        throw new BadRequestException(`Unknown add-on id: ${id}`);
      }
      seen.add(id);
      out.push(id as AddOnId);
    }
    return out;
  }

  private parseStripePriceMap(): StripePriceMap | null {
    const raw = this.config.get<string>('STRIPE_PRICE_MAP')?.trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return parsed as StripePriceMap;
    } catch {
      throw new BadRequestException(
        'STRIPE_PRICE_MAP must be valid JSON (flat or per-currency map).',
      );
    }
  }
}