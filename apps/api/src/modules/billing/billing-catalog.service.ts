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
import {
  normalizeCurrency,
  type SupportedCurrency,
} from '../../common/locale-currency';
import { CurrencyRatesService } from '../shop/currency-rates.service';
import {
  readBillingConfig,
  type BillingProviderChoice,
} from './billing-config';

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

type BillingRate = {
  marketCurrency: SupportedCurrency;
  chargeCurrency: SupportedCurrency;
  rate: number;
  ratesAt: string;
};

/**
 * GoSpots supports IQD for venue accounting, but Stripe does not currently
 * expose IQD as a supported presentment currency. Keep venue accounting intact
 * and fall back to EUR only for Stripe SaaS billing.
 */
const STRIPE_UNSUPPORTED_PRESENTMENT = new Set<SupportedCurrency>(['IQD']);

/** ISO 4217 minor-unit exponent for currencies supported by GoSpots. */
function minorUnitExponent(currency: SupportedCurrency): number {
  return currency === 'IQD' ? 3 : 2;
}

function toMinor(amount: number, currency: SupportedCurrency): number {
  return Math.max(
    0,
    Math.round(amount * 10 ** minorUnitExponent(currency)),
  );
}

@Injectable()
export class BillingCatalogService {
  constructor(
    private readonly config: ConfigService,
    private readonly rates: CurrencyRatesService,
  ) {}

  resolveBillingCurrency(
    provider: BillingProviderChoice | null | undefined,
    requestedCurrency: string,
  ): SupportedCurrency {
    const requested = normalizeCurrency(requestedCurrency);
    const effectiveProvider =
      provider ?? readBillingConfig(this.config).defaultProvider;
    if (
      effectiveProvider === 'STRIPE' &&
      STRIPE_UNSUPPORTED_PRESENTMENT.has(requested)
    ) {
      return 'EUR';
    }
    return requested;
  }

  private async resolveBillingRate(
    provider: BillingProviderChoice | null | undefined,
    requestedCurrency: string,
  ): Promise<BillingRate> {
    const marketCurrency = normalizeCurrency(requestedCurrency);
    const preferredChargeCurrency = this.resolveBillingCurrency(
      provider,
      requestedCurrency,
    );

    if (preferredChargeCurrency === 'EUR') {
      return {
        marketCurrency,
        chargeCurrency: 'EUR',
        rate: 1,
        ratesAt: new Date().toISOString(),
      };
    }

    try {
      const { rate, ratesAt } = await this.rates.getRate(
        'EUR',
        preferredChargeCurrency,
        { forceRefresh: false },
      );
      return {
        marketCurrency,
        chargeCurrency: preferredChargeCurrency,
        rate,
        ratesAt,
      };
    } catch {
      // FX is an optional localization enhancement, not a payment dependency.
      // Preserve the market-adjusted EUR price and let checkout proceed in EUR.
      return {
        marketCurrency,
        chargeCurrency: 'EUR',
        rate: 1,
        ratesAt: new Date().toISOString(),
      };
    }
  }

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

  async listCatalog(
    currency: string,
    provider?: BillingProviderChoice | null,
  ): Promise<{
    currency: string;
    packs: CatalogEntry[];
    addOns: CatalogEntry[];
    fxRate: number;
    ratesAt: string;
  }> {
    const resolved = await this.resolveBillingRate(provider, currency);
    const { marketCurrency, chargeCurrency, rate, ratesAt } = resolved;

    const packs: CatalogEntry[] = VENUE_PACK_LIST.map((pack) => {
      const eur = marketAdjustedCatalogEur(pack.monthlyPrice, marketCurrency);
      const local = this.rates.convertAmount(eur, rate);
      return {
        id: pack.id,
        kind: 'pack' as const,
        name: pack.name,
        tagline: pack.tagline,
        monthlyPriceEur: eur,
        monthlyPrice: local,
        monthlyPriceMinor: toMinor(local, chargeCurrency),
        currency: chargeCurrency,
        stripePriceId: this.resolveStripePriceId(
          `pack:${pack.id}`,
          chargeCurrency,
        ),
      };
    });

    const addOns: CatalogEntry[] = VENUE_ADD_ON_LIST.map((addOn) => {
      const eur = marketAdjustedCatalogEur(addOn.monthlyPrice, marketCurrency);
      const local = this.rates.convertAmount(eur, rate);
      return {
        id: addOn.id,
        kind: 'add_on' as const,
        name: addOn.name,
        tagline: addOn.tagline,
        monthlyPriceEur: eur,
        monthlyPrice: local,
        monthlyPriceMinor: toMinor(local, chargeCurrency),
        currency: chargeCurrency,
        pricedPerSeat: addOn.pricedPerSeat,
        stripePriceId: this.resolveStripePriceId(addOn.id, chargeCurrency),
      };
    });

    return {
      currency: chargeCurrency,
      packs,
      addOns,
      fxRate: rate,
      ratesAt,
    };
  }

  /**
   * Server-side quote — never trust client prices.
   * Uses venue-packs `monthlyTotal` + market adjustment, then cached/live FX.
   * If FX is unavailable, checkout continues in EUR at the already-adjusted
   * EUR price instead of making a third-party FX service a payment dependency.
   */
  async quote(input: {
    packId: string;
    addOnIds: string[];
    seatQuantity?: number;
    currency: string;
    provider?: BillingProviderChoice | null;
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

    const resolved = await this.resolveBillingRate(input.provider, input.currency);
    const { marketCurrency, chargeCurrency, rate, ratesAt } = resolved;
    const addOnsCsv = serializeAddOns(addOnIds);
    const amountEur = marketAdjustedCatalogEur(
      monthlyTotal(packId, addOnsCsv, seats),
      marketCurrency,
    );
    const amount = this.rates.convertAmount(amountEur, rate);
    const amountMinor = toMinor(amount, chargeCurrency);

    const lineItems: CatalogLineItem[] = [];
    const pack = VENUE_PACK_LIST.find((p) => p.id === packId);
    if (pack) {
      const eur = marketAdjustedCatalogEur(
        pack.monthlyPrice,
        marketCurrency,
      );
      const local = this.rates.convertAmount(eur, rate);
      lineItems.push({
        kind: 'pack',
        id: pack.id,
        name: pack.name,
        quantity: 1,
        unitAmount: local,
        amount: local,
        amountMinor: toMinor(local, chargeCurrency),
        stripePriceId: this.resolveStripePriceId(
          `pack:${pack.id}`,
          chargeCurrency,
        ),
      });
    }

    for (const id of addOnIds) {
      const addOn = VENUE_ADD_ONS[id];
      const eurUnit = marketAdjustedCatalogEur(
        addOn.monthlyPrice,
        marketCurrency,
      );
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
          amountMinor: toMinor(lineAmount, chargeCurrency),
          stripePriceId: this.resolveStripePriceId(id, chargeCurrency),
        });
      } else {
        lineItems.push({
          kind: 'add_on',
          id,
          name: addOn.name,
          quantity: 1,
          unitAmount: unitLocal,
          amount: unitLocal,
          amountMinor: toMinor(unitLocal, chargeCurrency),
          stripePriceId: this.resolveStripePriceId(id, chargeCurrency),
        });
      }
    }

    return {
      packId,
      addOnIds,
      seatQuantity: seats,
      currency: chargeCurrency,
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
