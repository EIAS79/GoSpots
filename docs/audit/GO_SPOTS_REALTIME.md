# Locora — Realtime / live updates (Bible §23 / #28)

**Date:** 2026-07-20 (design) / 2026-07-21 (notifications SSE + #28 DONE) / 2026-07-22 (residual docs lane **SSE23-residual-docs**)  
**Status:** **Bible #28 / §23 PARTIAL** — single-instance ship bar **DONE** (in-process notifications SSE + poll fallback). Redis/PG NOTIFY multi-instance fan-out and floor/chat SSE are **explicitly deferred** — phased plan below. **No Redis dependency on disk today.**  
**Audit:** P2 §2.20 / original prompt **§23**.

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Staff notifications SSE (`GET /notifications/stream`) | **DONE** | Lane XX; Nest `@Sse`; cookie JWT + shop scope |
| In-process `NotificationsSseHub` (same-instance emit) | **DONE** | jest sse hub **2** PASS |
| Web `useNotificationsSse` → silent panel refetch | **DONE** | notifications panel hook |
| Poll fallback (panel ~20s; toast ~15s poll-primary) | **DONE** (required) | multi-instance + reconnect safety net |
| `@SkipThrottle` / heartbeat on stream route | **DONE** | long-lived connect not throttled |
| Floor / sessions / guest-chat server push | **RESIDUAL** | poll-only (10–15s / 3.5–8s) |
| Toast path SSE (replace 15s recent poll) | **RESIDUAL** | poll-primary by design until multi-instance-safe |
| Redis / PG NOTIFY multi-instance fan-out | **RESIDUAL** | **no Redis dep / adapter on disk** — trigger ≥2 API instances |
| `RealtimePublisher` shared bus | **RESIDUAL** | sketch only; hub is notifications-only |
| WebSockets / Socket.IO | **RESIDUAL** (intentionally avoided) | SSE-first decision stands |

**§23 classification:** **PARTIAL** — single-instance ship bar met; scale residuals documented here, not hidden.

---

### Lane XX (notifications SSE — in-process only) — shipped

- Nest `@Sse` `GET /api/v1/notifications/stream`; `NotificationsSseHub` is **in-process only** (emit reaches clients on the same API instance).
- Web `useNotificationsSse` on notifications panel → silent refetch on `notification` events.
- **Poll fallback retained (required):** panel ~20s `useLiveData`; toast path still poll-primary (~15s) — covers multi-instance and SSE drop.
- **Multi-instance:** Redis/pubsub (or PG NOTIFY) adapter **deferred** until ≥2 API instances.

### Ship bar (Lane UUUUU)

| In scope (DONE) | Explicit non-goals / later |
|-----------------|----------------------------|
| Cookie-auth notifications SSE + heartbeat | Redis / PG NOTIFY fan-out |
| In-process hub on one API instance | Floor / sessions / guest-chat SSE |
| Poll fallback kept | WebSockets / Socket.IO |
| Toast remains poll-primary | Sub-second chat typing |

---

## Recommendation (scale / post-submit)

| When | Action |
|------|--------|
| **Single API instance (today)** | Notifications SSE + poll fallback is enough. |
| **≥2 API instances** | Add Redis/pubsub or PG NOTIFY adapter to `NotificationsSseHub`. |
| **Ops polish** | Floor / guest-chat SSE after notifications path is multi-instance-safe. |

**Why poll stays:** Sticky sessions are not assumed; poll is the multi-instance and reconnect safety net.

---

## What exists today

### Client patterns

| Piece | Role |
|-------|------|
| `useLiveData` | Background refetch (default **20s**); pause when tab hidden; refetch on focus; optional section filter |
| `live-events.ts` | **Same-tab only** `CustomEvent` (`Locora:live`) — not cross-browser, not cross-device |
| `useNotificationsSse` | `EventSource` → `/notifications/stream`; triggers silent panel refetch |
| `NotificationToasts` | Polls `/notifications/recent?since=` every **15s**; publishes `live-events` so other pages refetch early |

### Surfaces that already “feel live”

| Surface | Typical interval / push | Auth |
|---------|-------------------------|------|
| Staff **notifications** inbox | SSE push + **20s** poll fallback | Cookie session |
| Staff **notification toasts** | **15s** poll-primary | Cookie session |
| Staff **sessions / floor** ops | **10–15s** poll | Cookie session + venue bind |
| Staff **guest messaging** | **3.5–8s** poll | Cookie + `messaging.*` |
| Public **guest chat** widget | **4s** poll | Opaque chat token |
| Public gaming/dining schedule / status | **15s** poll | Public / status token |

Server push today: **notifications SSE only** (Nest `@Sse`). No WebSocket / Socket.IO gateway.

---

## Where server push would help most

Prioritize by latency sensitivity and poll waste (many open dashboards × short intervals).

### 1. Floor / sessions (highest ops value)

**Why:** Staff act on unit availability, walk-ins, and seating in near real time. 10–15s lag is noticeable when two stations book the same unit; push + short refetch beats blind multi-tab polls.

**Events (sketch):** `reservation.changed`, `unit.floor_status`, `session.started|ended`, `order.kitchen` (if tied to floor).

**Payload:** Prefer **ids + section + shopId** → client refetches existing REST. Avoid shipping full floor graphs on the wire.

### 2. Notifications (highest fan-out / easiest spike)

**Why:** Already the cross-page “hint” bus via toasts → `publishLiveEvent`. Replacing the 15s recent-poll with a push channel cuts background API load and makes toasts feel instant.

**Events:** `notification.created` (id, section, unreadCount hint).

**Fit:** Natural first spike — one authenticated stream, maps cleanly onto existing `live-events` sections.

### 3. Guest chat (highest perceived “live”)

**Why:** Thread polls at **~3.5–4s** on both staff and guest sides. Chat is where users expect sub-second delivery; polling burns quota and still feels laggy.

**Auth split (important):**

- Staff: cookie JWT + shop membership + `messaging.read|write`
- Guest: **chat token** in path/storage (same trust model as today’s REST), **not** staff cookies

**Events:** `chat.message`, `chat.status` (WAITING|OPEN|PAUSED|ENDED), scoped by `chatId` / guest token hash.

### Lower priority (post v1 realtime)

Finance / menu / reviews / subscription — longer poll OK; push only if the same bus is already up and emit is cheap.

---

## Transport options

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A. SSE (Server-Sent Events)** | Simple Nest HTTP route; one-way server→client; works with cookie `credentials` on same-origin `/api/v1` proxy; auto-reconnect via `EventSource` (or `fetch` stream if headers needed); easy to reason about | No browser→server frames (mutations stay REST); some proxies buffer; multi-instance needs shared pub (Redis/Postgres LISTEN) | **Recommended first** |
| **B. Nest `@WebSocketGateway` (ws)** | Bidirectional; Nest-native | Cookie handshake awkward; sticky sessions or Redis adapter for multi-instance; more moving parts than we need for “refetch hints” | Defer unless chat needs client-originated WS frames |
| **C. Socket.IO** | Rooms, reconnect, fallbacks | Extra dependency + adapter story; overkill for id/section hints; same cookie/CORS complexity | **Avoid** unless product requires Socket.IO rooms at scale |

### Decision (post-submit)

**Start with SSE** for staff notifications + floor hints; keep all writes on existing REST.  
If guest chat later needs presence/typing over the same pipe, either:

- extend SSE + REST posts (simplest), or  
- add a **narrow** Nest WS gateway for `chat:*` rooms only — not a wholesale Socket.IO migration.

Do **not** put finance ledger or billing webhooks on a realtime bus.

---

## Auth & cookie concerns

Session model today: **httpOnly** access/refresh cookies, CSRF double-submit on mutations, CORS `credentials` when origins are configured, preference for **SameSite=lax** + same-origin Vercel `/api/v1` proxy (`cookie-options.util.ts`).

| Concern | Implication for realtime |
|---------|--------------------------|
| **httpOnly access cookie** | Browser will send it on same-site SSE/`EventSource` to `/api/v1/...` if URL is same-origin (proxy). Cross-origin API host needs `SameSite=none; Secure` + explicit CORS — already a footgun for REST; **do not** invent a second auth path (no access token in query string). |
| **CSRF** | SSE/WS are typically **read-only subscribe**; keep mutations on REST + CSRF. Do not accept state-changing commands over the push channel in v1. |
| **Venue bind** | Staff stream must be scoped to **active shopId** (JWT claim / membership), same as tenant APIs. Reject subscribe without venue context. |
| **Guest chat** | Separate channel or topic authenticated by **guest chat token** (hash/lookup like REST). Never attach staff cookies to the public venue origin for chat push. |
| **EventSource + custom headers** | Native `EventSource` cannot set `Authorization`. Cookie/same-origin is the right model; if we ever need header auth, use `fetch` + `ReadableStream` SSE parser instead of leaking tokens into query params. |
| **Multi-tab** | One SSE per tab is fine initially; optional later: SharedWorker or single shared connection. Same-tab `live-events` can remain as a local fan-out after one tab receives SSE. |
| **Multi-instance API** | In-process emit only reaches clients on that instance. Post-submit need **Redis pub/sub** or **Postgres NOTIFY** (or sticky sessions — weaker). Treat adapter as part of the first production PR, not an afterthought. |
| **Helmet / proxy buffering** | Disable response buffering for the SSE path; set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, flush heartbeats (~15–30s) so load balancers do not idle-close. |
| **Throttle** | Global HTTP throttle must **not** treat long-lived SSE connect as 100 req/min abuse; exclude or special-case the stream route. |

**Non-negotiable:** no JWTs or guest tokens in URL query strings for “EventSource convenience.”

---

## Target architecture (sketch — not built)

```
[mutation services] --emit--> [RealtimePublisher] --(Redis/PG)--> [SSE controller]
                                      |
                                      v
                    rooms: shop:{shopId}:ops | shop:{shopId}:notify
                           chat:{chatId} (guest token or staff membership)

Browser: EventSource/fetch stream → publishLiveEvent(...) → useLiveData refetch
         writes remain existing REST (+ CSRF)
```

**Publisher API (future):** thin `RealtimePublisher.publish({ shopId, section, resourceId?, meta? })` called from notifications create, reservation status transitions, guest-chat message insert — **not** from every finance line.

Reuse `LiveEventSection` union on the client so SSE payloads drop into today’s `publishLiveEvent` without rewriting every page.

---

## Residual phased plan (Redis SSE + scale)

Phases ordered by deploy topology and ops value. **Do not add Redis until Gate 0 (≥2 API instances) is true** — poll fallback covers today’s single-instance Render deploy.

### Phase 0 — Single-instance notifications SSE (**DONE**)

- [x] In-process `NotificationsSseHub` + `GET /notifications/stream`
- [x] Web panel hook; poll fallback retained (panel + toast)
- [x] Throttle skip + heartbeat (~25s)

**Exit:** Staff notification inbox feels push on one API instance; poll covers missed events.

### Phase 1 — Multi-instance fan-out (**RESIDUAL** — Redis or PG NOTIFY)

**Trigger:** Render (or other host) runs **≥2** API instances **without** sticky sessions, **or** notification SSE misses are observed in prod.

**Goal:** `notification.created` emitted on instance A reaches SSE clients connected to instance B.

| Work | Notes |
|------|--------|
| Choose bus | **Redis pub/sub** (preferred if Redis already provisioned for throttle/captcha) **or** **Postgres `NOTIFY`** (no new infra; reuse Neon) |
| `RealtimePublisher` thin wrapper | `publish({ shopId, section, resourceId?, meta? })` → bus; SSE controllers subscribe per instance |
| Refactor `NotificationsSseHub` | Local emit + bus subscribe; keep in-process fast path when bus unavailable (dev) |
| Env + ops | `REDIS_URL` (if Redis) or channel naming doc; health does not require Redis until flag on |
| Load / soak | Two-instance smoke: create notification → both instances’ clients receive hint |

**Non-goals:** floor/chat topics; toast SSE cutover; WebSockets.

**Exit:** Notifications SSE correct under horizontal scale; poll fallback **still required** (degraded mode).

### Phase 2 — Floor / sessions SSE (**RESIDUAL**)

**Prerequisite:** Phase 1 bus live (floor hints must fan-out across instances).

| Work | Notes |
|------|--------|
| Staff ops stream or shared `/realtime/stream` | Shop-scoped; venue bind same as REST |
| Emit hooks | Reservation status, unit floor status, session start/end — ids + section only |
| Web | Subscribe + `publishLiveEvent` → existing `useLiveData` refetch |
| Poll interval | May rise to ~60s safety net once push proven |

**Exit:** Two staff stations see floor changes without 10–15s blind poll lag.

### Phase 3 — Guest chat SSE (**RESIDUAL**)

**Prerequisite:** Phase 1 bus; token-scoped auth model documented in [Auth & cookie concerns](#auth--cookie-concerns).

| Work | Notes |
|------|--------|
| Staff thread stream | Cookie + `messaging.*` perms |
| Guest widget stream | Chat token in path/storage — **not** staff cookies on public origin |
| Events | `chat.message`, `chat.status` scoped by `chatId` |
| Poll | Drop 3.5–4s thread poll to heartbeat-only fallback |

**Exit:** Chat feels sub-second; poll remains reconnect fallback.

### Phase 4 — Ops polish + load test (**RESIDUAL**)

- [ ] Proxy buffering verified (Render/Vercel): `text/event-stream`, `Cache-Control: no-cache`, no gzip buffer on stream path
- [ ] Heartbeat + idle-close runbook in [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) disconnect handling
- [ ] Optional: toast path moves from poll-primary to SSE-hint (only after Phase 1 stable)

**Exit:** Documented runbook; load test on ≥2 instances with SSE + poll fallback.

Keep `useLiveData` as **fallback forever** (visibility resume, missed events, degraded mode).

---

## Legacy design phases (superseded by table above)

| Old phase | Disposition |
|-----------|-------------|
| Design doc (2026-07-20) | **DONE** — this file |
| Notification spike | **DONE** — Lane XX (Phase 0) |
| Floor / chat / Redis | Remapped to Phases 1–4 above |

---

## Non-goals (this lane / pre-submit)

- Installing `socket.io`, `@nestjs/websockets`, `ws`, or Redis
- Touching `main.ts`, auth cookie helpers, or CORS for a stream
- Changing marketing copy (“Realtime sync”) before a real transport exists
- Replacing REST mutations with WS commands
- Presence avatars, typing indicators, or CRDT collaborative editing

---

## Files (this lane)

| Path | Role |
|------|------|
| `docs/audit/GO_SPOTS_REALTIME.md` | This design |
| `docs/audit/AGENT_COORDINATION.md` | Lane N claim/complete |
| `docs/audit/GO_SPOTS_IMPLEMENTATION_REPORT.md` | Short append |

**Verify:** n/a (docs only)
