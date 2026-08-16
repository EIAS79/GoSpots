import { RestaurantOrderLifecycle } from '@prisma/client';
import {
  isRestaurantLifecycleTransitionAllowed,
  restaurantTimerBand,
} from './restaurant-operations.service';

describe('Phase 6 restaurant lifecycle', () => {
  it('keeps fulfillment lifecycle forward-only', () => {
    expect(
      isRestaurantLifecycleTransitionAllowed(
        RestaurantOrderLifecycle.PLACED,
        RestaurantOrderLifecycle.ACKNOWLEDGED,
      ),
    ).toBe(true);
    expect(
      isRestaurantLifecycleTransitionAllowed(
        RestaurantOrderLifecycle.ACKNOWLEDGED,
        RestaurantOrderLifecycle.IN_PREPARATION,
      ),
    ).toBe(true);
    expect(
      isRestaurantLifecycleTransitionAllowed(
        RestaurantOrderLifecycle.READY,
        RestaurantOrderLifecycle.SERVED,
      ),
    ).toBe(true);
    expect(
      isRestaurantLifecycleTransitionAllowed(
        RestaurantOrderLifecycle.SERVED,
        RestaurantOrderLifecycle.READY,
      ),
    ).toBe(false);
  });

  it('allows cancellation before fulfillment close but not after close', () => {
    expect(
      isRestaurantLifecycleTransitionAllowed(
        RestaurantOrderLifecycle.IN_PREPARATION,
        RestaurantOrderLifecycle.CANCELLED,
      ),
    ).toBe(true);
    expect(
      isRestaurantLifecycleTransitionAllowed(
        RestaurantOrderLifecycle.CLOSED,
        RestaurantOrderLifecycle.CANCELLED,
      ),
    ).toBe(false);
  });

  it('uses configurable KDS warning and overdue thresholds', () => {
    expect(restaurantTimerBand(449, 600, 75, 100)).toBe('GREEN');
    expect(restaurantTimerBand(450, 600, 75, 100)).toBe('AMBER');
    expect(restaurantTimerBand(600, 600, 75, 100)).toBe('RED');
    expect(restaurantTimerBand(540, 600, 80, 120)).toBe('AMBER');
    expect(restaurantTimerBand(720, 600, 80, 120)).toBe('RED');
  });
});
