import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { GrowthDepositPublicController } from './growth-deposit-public.controller';
import { GrowthDepositWebhookController } from './growth-deposit-webhook.controller';
import { GrowthPublicController } from './growth-public.controller';

describe('Phase 8 public auth boundary', () => {
  it.each([
    ['guest reservation API', GrowthPublicController],
    ['reservation deposit API', GrowthDepositPublicController],
    ['reservation Stripe webhook', GrowthDepositWebhookController],
  ])('marks %s as public for the global JWT guard', (_name, controller) => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller)).toBe(true);
  });
});
