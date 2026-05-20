import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  isSupportedCurrency,
  normalizeCurrency,
  SUPPORTED_CURRENCIES,
  SUPPORTED_CURRENCY_CODES,
  type SupportedCurrency,
} from "../../common/locale-currency";

/** 1 EUR equals `rates[code]` units of `code` */
type RateTable = {
  pivot: SupportedCurrency;
  rates: Record<string, number>;
  fetchedAt: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const PIVOT: SupportedCurrency = "EUR";

@Injectable()
export class CurrencyRatesService {
  private readonly logger = new Logger(CurrencyRatesService.name);
  private tableCache: RateTable | null = null;

  listCurrencies() {
    return SUPPORTED_CURRENCIES;
  }

  async convert(
    amount: number,
    from: string,
    targets: string[],
  ): Promise<{
    amount: number;
    from: string;
    ratesAt: string;
    conversions: { currency: string; amount: number; rate: number }[];
  }> {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException("Amount must be a non-negative number.");
    }
    const fromCode = normalizeCurrency(from);
    const uniqueTargets = [
      ...new Set(
        targets.map((t) => {
          if (!isSupportedCurrency(t)) {
            throw new BadRequestException(`Unsupported currency: ${t}`);
          }
          return t.toUpperCase() as SupportedCurrency;
        }),
      ),
    ];
    if (uniqueTargets.length === 0) {
      throw new BadRequestException("Provide at least one target currency.");
    }

    const { rates, fetchedAt } = await this.getRateTable();
    const fromPivot = rates[fromCode];
    if (fromPivot == null || fromPivot <= 0) {
      throw new BadRequestException(
        `Exchange rate unavailable for ${fromCode}.`,
      );
    }

    const conversions = uniqueTargets.map((currency) => {
      if (currency === fromCode) {
        return { currency, amount, rate: 1 };
      }
      const toPivot = rates[currency];
      if (toPivot == null || toPivot <= 0) {
        throw new BadRequestException(
          `No exchange rate from ${fromCode} to ${currency}.`,
        );
      }
      const rate = toPivot / fromPivot;
      const converted = roundMoney(amount * rate);
      return { currency, amount: converted, rate };
    });

    return {
      amount,
      from: fromCode,
      ratesAt: new Date(fetchedAt).toISOString(),
      conversions,
    };
  }

  private async getRateTable(): Promise<RateTable> {
    const hit = this.tableCache;
    if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
      return hit;
    }

    const rates = await this.fetchPivotRates();
    const table: RateTable = {
      pivot: PIVOT,
      rates,
      fetchedAt: Date.now(),
    };
    this.tableCache = table;
    return table;
  }

  private async fetchPivotRates(): Promise<Record<string, number>> {
    const rates: Record<string, number> = { [PIVOT]: 1 };
    const missing = new Set<string>(SUPPORTED_CURRENCY_CODES);

    await this.mergeOpenErLatest(rates, missing, PIVOT);
    if (missing.size > 0) {
      await this.mergeOpenErLatest(rates, missing, "USD");
    }
    if (missing.size > 0) {
      await this.mergeFrankfurter(rates, missing);
    }
    if (missing.size > 0) {
      await this.mergeOpenErPairs(rates, missing);
    }

    const stillMissing = SUPPORTED_CURRENCY_CODES.filter(
      (c) => rates[c] == null || rates[c] <= 0,
    );
    if (stillMissing.length > 0) {
      this.logger.error(`Missing rates for: ${stillMissing.join(", ")}`);
      throw new BadRequestException(
        `Exchange rates unavailable for: ${stillMissing.join(", ")}. Try again shortly.`,
      );
    }

    return rates;
  }

  private async mergeOpenErLatest(
    rates: Record<string, number>,
    missing: Set<string>,
    base: string,
  ) {
    if (missing.size === 0) return;

    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        result?: string;
        rates?: Record<string, number>;
      };
      if (body.result !== "success" || !body.rates) {
        throw new Error("unexpected response");
      }
      this.applyCrossBase(rates, missing, base, body.rates);
    } catch (err) {
      this.logger.warn(`open.er-api latest/${base} failed: ${err}`);
    }
  }

  private async mergeFrankfurter(
    rates: Record<string, number>,
    missing: Set<string>,
  ) {
    const need = [...missing];
    if (need.length === 0) return;

    try {
      const res = await fetch(
        `https://api.frankfurter.app/latest?from=${PIVOT}&to=${need.join(",")}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { rates: Record<string, number> };
      for (const code of need) {
        const r = body.rates[code];
        if (r != null && r > 0) {
          rates[code] = r;
          missing.delete(code);
        }
      }
    } catch (err) {
      this.logger.warn(`Frankfurter fetch failed: ${err}`);
    }
  }

  private async mergeOpenErPairs(
    rates: Record<string, number>,
    missing: Set<string>,
  ) {
    for (const code of [...missing]) {
      if (code === PIVOT) {
        rates[code] = 1;
        missing.delete(code);
        continue;
      }
      try {
        const res = await fetch(
          `https://open.er-api.com/v6/pair/${PIVOT}/${code}`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (!res.ok) continue;
        const body = (await res.json()) as {
          result?: string;
          conversion_rate?: number;
        };
        if (
          body.result === "success" &&
          body.conversion_rate != null &&
          body.conversion_rate > 0
        ) {
          rates[code] = body.conversion_rate;
          missing.delete(code);
        }
      } catch (err) {
        this.logger.warn(`open.er-api pair ${PIVOT}/${code}: ${err}`);
      }
    }
  }

  /** Normalize provider rates into 1 EUR = rates[code] */
  private applyCrossBase(
    rates: Record<string, number>,
    missing: Set<string>,
    providerBase: string,
    providerRates: Record<string, number>,
  ) {
    if (providerBase === PIVOT) {
      for (const code of [...missing]) {
        const raw = providerRates[code];
        if (raw == null || raw <= 0) continue;
        rates[code] = code === PIVOT ? 1 : raw;
        missing.delete(code);
      }
      return;
    }

    const eurPerBase = providerRates[PIVOT];
    if (eurPerBase == null || eurPerBase <= 0) return;

    for (const code of [...missing]) {
      const raw = providerRates[code];
      if (raw == null || raw <= 0) continue;
      rates[code] = code === PIVOT ? 1 : raw / eurPerBase;
      missing.delete(code);
    }
  }
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}
