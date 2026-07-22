import { Injectable } from '@nestjs/common';
import { filter, Observable, Subject } from 'rxjs';

/**
 * In-process fan-out for staff notification SSE.
 *
 * Multi-instance / Redis / Postgres NOTIFY push is intentionally deferred
 * (see docs/audit/GO_SPOTS_REALTIME.md). Until then, clients on other API
 * instances still rely on polling `/notifications/recent`.
 */
export type NotificationSsePayload = {
  shopId: string;
  userId: string | null;
  id: string;
  section: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
};

@Injectable()
export class NotificationsSseHub {
  private readonly subject = new Subject<NotificationSsePayload>();

  publish(payload: NotificationSsePayload) {
    this.subject.next(payload);
  }

  /** Shop-scoped stream; optional user filter (shop-wide + targeted). */
  forActor(shopId: string, userId: string): Observable<NotificationSsePayload> {
    return this.subject.pipe(
      filter(
        (n) =>
          n.shopId === shopId && (n.userId === null || n.userId === userId),
      ),
    );
  }
}
