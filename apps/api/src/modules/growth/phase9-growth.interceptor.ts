import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { from, lastValueFrom } from 'rxjs';
import {
  hasPermission,
  PERMISSIONS,
  type PermissionKey,
} from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import type { JwtAccessPayload } from '../auth/auth.service';
import { GrowthPricingService } from './growth-pricing.service';
import type {
  LoyaltyEntryDto,
  MergeCustomerDto,
  QuoteDto,
  ReverseRewardsDto,
  SnapshotDto,
  StoredValueEntryDto,
} from './growth.types';
import { Phase9CustomerValueService } from './phase9-customer-value.service';
import { Phase9GuardrailsService } from './phase9-guardrails.service';
import { Phase9LoyaltyExpiryService } from './phase9-loyalty-expiry.service';

type RequestLike = {
  method?: string;
  path?: string;
  url?: string;
  body?: unknown;
  user?: JwtAccessPayload;
};

@Injectable()
export class Phase9GrowthInterceptor implements NestInterceptor {
  constructor(
    private readonly phase9: Phase9CustomerValueService,
    private readonly guardrails: Phase9GuardrailsService,
    private readonly pricing: GrowthPricingService,
    private readonly loyaltyExpiry: Phase9LoyaltyExpiryService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    return from(this.route(request, next));
  }

  private async route(
    request: RequestLike,
    next: CallHandler,
  ): Promise<unknown> {
    const method = (request.method ?? '').toUpperCase();
    const path = (request.path ?? request.url ?? '').split('?')[0];
    const actor = request.user;
    if (!actor || !path.includes('/growth')) {
      return lastValueFrom(next.handle() as Observable<unknown>);
    }

    let match: RegExpMatchArray | null;

    if (method === 'GET' && /\/growth\/customers(?:\/[^/]+\/history)?$/.test(path)) {
      this.assertPermission(actor, PERMISSIONS.CUSTOMER_READ);
    }
    if (
      method === 'POST' &&
      (/\/growth\/customers$/.test(path) ||
        /\/growth\/customers\/[^/]+\/merge$/.test(path) ||
        /\/growth\/customers\/[^/]+\/marketing-consent$/.test(path))
    ) {
      this.assertPermission(actor, PERMISSIONS.CUSTOMER_WRITE);
    }
    if (
      method === 'POST' &&
      (/\/growth\/customers\/[^/]+\/(?:membership|loyalty|rewards\/reverse)$/.test(path) ||
        /\/growth\/stored-value\/accounts(?:\/[^/]+\/ledger)?$/.test(path))
    ) {
      this.assertPermission(actor, PERMISSIONS.MEMBERSHIP_WRITE);
    }

    match = path.match(/\/growth\/customers\/([^/]+)\/marketing-consent$/);
    if (method === 'POST' && match) {
      return this.phase9.setMarketingConsent(
        actor,
        decodeURIComponent(match[1]),
        request.body as { granted: boolean; source?: string },
      );
    }

    match = path.match(/\/growth\/customers\/([^/]+)\/loyalty$/);
    if (method === 'POST' && match) {
      const customerId = decodeURIComponent(match[1]);
      await this.loyaltyExpiry.processDue(
        requireShopId(actor),
        customerId,
        actor.sub,
      );
      return this.phase9.loyalty(
        actor,
        customerId,
        request.body as LoyaltyEntryDto,
      );
    }

    match = path.match(/\/growth\/customers\/([^/]+)\/rewards\/reverse$/);
    if (method === 'POST' && match) {
      const customerId = decodeURIComponent(match[1]);
      await this.loyaltyExpiry.processDue(
        requireShopId(actor),
        customerId,
        actor.sub,
      );
      return this.phase9.reverseRewards(
        actor,
        customerId,
        request.body as ReverseRewardsDto,
      );
    }

    match = path.match(/\/growth\/stored-value\/accounts\/([^/]+)\/ledger$/);
    if (method === 'POST' && match) {
      return this.phase9.storedValue(
        actor,
        decodeURIComponent(match[1]),
        request.body as StoredValueEntryDto,
      );
    }

    if (method === 'POST' && /\/growth\/pricing\/quote$/.test(path)) {
      const normalized = await this.guardrails.normalizeQuote(
        actor,
        request.body as QuoteDto,
      );
      const quote = await this.pricing.quote(actor, normalized);
      return this.phase9.assertPromotionPolicies(actor, normalized, quote);
    }

    if (method === 'POST' && /\/growth\/pricing\/snapshots$/.test(path)) {
      const normalized = await this.guardrails.normalizeQuote(
        actor,
        request.body as SnapshotDto,
      );
      return this.phase9.snapshotWithUsagePolicies(actor, normalized);
    }

    const result: unknown = await lastValueFrom(
      next.handle() as Observable<unknown>,
    );

    if (method === 'POST' && /\/growth\/customers$/.test(path)) {
      const customerId = this.resultId(result);
      if (customerId) await this.phase9.ensureConsentProvenance(actor, customerId);
    }

    match = path.match(/\/growth\/customers\/([^/]+)\/merge$/);
    if (method === 'POST' && match) {
      const canonicalId = decodeURIComponent(match[1]);
      const body = request.body as MergeCustomerDto;
      if (body?.mergedCustomerId) {
        await this.phase9.finalizeCustomerMerge(
          actor,
          canonicalId,
          body.mergedCustomerId,
        );
      }
    }

    match = path.match(/\/growth\/customers\/([^/]+)\/membership$/);
    if (method === 'POST' && match) {
      await this.phase9.recordMembershipEnrollment(
        actor,
        decodeURIComponent(match[1]),
      );
    }

    if (method === 'POST' && /\/growth\/stored-value\/accounts$/.test(path)) {
      const accountId = this.resultAccountId(result);
      if (accountId) {
        await this.phase9.configureStoredValuePolicy(actor, accountId, {});
      }
    }

    return result;
  }

  private assertPermission(actor: JwtAccessPayload, permission: PermissionKey) {
    if (actor.shopRole === 'OWNER') return;
    if (!hasPermission(actor.perms ?? '', permission)) {
      throw new ForbiddenException(`Missing ${permission} permission.`);
    }
  }

  private resultId(result: unknown): string | null {
    if (!result || typeof result !== 'object') return null;
    const id = (result as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }

  private resultAccountId(result: unknown): string | null {
    if (!result || typeof result !== 'object') return null;
    const account = (result as { account?: { id?: unknown } }).account;
    return typeof account?.id === 'string' ? account.id : null;
  }
}
