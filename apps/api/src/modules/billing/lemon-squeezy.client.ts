import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type LemonCheckoutResponse = {
  data?: {
    attributes?: {
      url?: string;
    };
  };
};

type LemonSubscriptionResponse = {
  data?: {
    id?: string;
    attributes?: {
      urls?: {
        customer_portal?: string;
        update_payment_method?: string;
      };
      status?: string;
      customer_id?: number | string;
    };
  };
};

@Injectable()
export class LemonSqueezyClient {
  private readonly logger = new Logger(LemonSqueezyClient.name);
  private readonly apiKey: string;
  private readonly storeId: string;
  private readonly variantId: string;
  private readonly baseUrl = 'https://api.lemonsqueezy.com/v1';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('LEMON_SQUEEZY_API_KEY') ?? '';
    this.storeId = this.config.get<string>('LEMON_SQUEEZY_STORE_ID') ?? '';
    this.variantId =
      this.config.get<string>('LEMON_SQUEEZY_VARIANT_ID') ?? '';
  }

  isConfigured() {
    return Boolean(this.apiKey && this.storeId && this.variantId);
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Billing is not configured yet. Set LEMON_SQUEEZY_API_KEY, LEMON_SQUEEZY_STORE_ID, and LEMON_SQUEEZY_VARIANT_ID.',
      );
    }
  }

  private headers() {
    return {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  /**
   * Creates a checkout for the venue pack total.
   * `customPriceCents` overrides the catalog variant price (store currency).
   */
  async createCheckout(input: {
    email: string;
    name?: string | null;
    customPriceCents: number;
    redirectUrl: string;
    custom: Record<string, string>;
    currency?: string;
  }): Promise<{ url: string }> {
    this.assertConfigured();

    const body = {
      data: {
        type: 'checkouts',
        attributes: {
          custom_price: Math.max(100, Math.round(input.customPriceCents)),
          product_options: {
            redirect_url: input.redirectUrl,
            receipt_button_text: 'Back to GoSpots',
            receipt_thank_you_note:
              'Your venue pack is active. Manage modules anytime in Subscription.',
          },
          checkout_options: {
            embed: false,
            media: false,
            logo: true,
            button_color: '#059669',
          },
          checkout_data: {
            email: input.email,
            name: input.name ?? undefined,
            custom: input.custom,
          },
        },
        relationships: {
          store: {
            data: { type: 'stores', id: String(this.storeId) },
          },
          variant: {
            data: { type: 'variants', id: String(this.variantId) },
          },
        },
      },
    };

    const res = await fetch(`${this.baseUrl}/checkouts`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Lemon Squeezy checkout failed: ${res.status} ${text}`);
      throw new ServiceUnavailableException(
        'Could not start checkout. Check Lemon Squeezy credentials and variant.',
      );
    }

    const json = (await res.json()) as LemonCheckoutResponse;
    const url = json.data?.attributes?.url;
    if (!url) {
      throw new ServiceUnavailableException(
        'Checkout URL missing from Lemon Squeezy.',
      );
    }
    return { url };
  }

  /** Customer portal for payment method, invoices, cancel. */
  async getCustomerPortalUrl(lemonSubscriptionId: string): Promise<string> {
    this.assertConfigured();
    const res = await fetch(
      `${this.baseUrl}/subscriptions/${encodeURIComponent(lemonSubscriptionId)}`,
      { headers: this.headers() },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Lemon subscription fetch failed: ${res.status} ${text}`);
      throw new ServiceUnavailableException(
        'Could not open billing portal. Try again or contact support.',
      );
    }
    const json = (await res.json()) as LemonSubscriptionResponse;
    const portal =
      json.data?.attributes?.urls?.customer_portal ||
      json.data?.attributes?.urls?.update_payment_method;
    if (!portal) {
      throw new ServiceUnavailableException(
        'Billing portal URL is not available for this subscription.',
      );
    }
    return portal;
  }

  /**
   * Cancel at period end via Lemon Squeezy.
   * Plan/add-on price changes still use local pending* until renewal;
   * payment method & cancel live in the customer portal.
   */
  async cancelSubscription(lemonSubscriptionId: string): Promise<void> {
    this.assertConfigured();
    const res = await fetch(
      `${this.baseUrl}/subscriptions/${encodeURIComponent(lemonSubscriptionId)}`,
      {
        method: 'DELETE',
        headers: this.headers(),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Lemon cancel failed: ${res.status} ${text}`);
      throw new ServiceUnavailableException(
        'Could not cancel subscription in Lemon Squeezy.',
      );
    }
  }
}
