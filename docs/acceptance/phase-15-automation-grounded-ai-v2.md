# GoSpots Phase 15 — Automation and Grounded AI v2

## Status

`READY_FOR_ACCEPTANCE` on the implementation branch. Final acceptance additionally requires the exact-head CI, guarded merge, exact-main deployment, and production/runtime verification required by the phase execution contract.

## Source

GoSpots Master Product & Engineering Execution Plan v2 — Phase 15.

## Baseline and scope

- Baseline `main`: `0bd0e64c80c81ef0c1496bfc2e1267fd2c254d29` (Phase 14 accepted baseline).
- Working branch: `phase-15/automation-grounded-ai`.
- Pull request: #80.
- Phase 16 is explicitly out of scope.
- No Phase 15 PostgreSQL schema migration is required. Existing automation, AI insight, notification, mail-outbox, webhook, customer preference, and Phase 14 analytics facts are reused as canonical infrastructure.

## Requirement matrix

| Phase 15 requirement | Implementation / evidence |
| --- | --- |
| Rule engine: trigger, condition, action, execution, step | Existing `AutomationRule`, `AutomationExecution`, `AutomationExecutionStep` are reused; Phase 15 extends the action executor without adding a parallel engine. |
| Dedupe | Venue-scoped `AutomationExecution(shopId,dedupeKey)` replay contract is preserved. External side effects additionally use stable execution/step keys. |
| Retry | Every action is attempted at most three times with the same durable side-effect key. |
| Dead letter | Exhausted actions persist `AutomationDeadLetter`; replay reuses the original execution identity. |
| Audit | Rule/execution/step/dead-letter records preserve operational evidence; explicit audit actions write `AuditLog`. |
| Safe templates | The catalog contains all 11 v2 templates: reservation reminder, no-show follow-up, low-stock, long-running session, open-tab close warning, cash variance, fiscal/KSeF failure, unresolved payment, daily owner summary, device offline, membership expiry. |
| Low-risk actions | `NOTIFICATION`, `TASK`, `ATTENTION`, `EMAIL`, provider-neutral `SMS`, `CUSTOMER_TAG`, `REPORT` are supported. Existing `AUDIT`, `WEBHOOK`, and `NOOP` remain compatible. |
| High-risk actions | Autonomous `REFUND`, `PRICE_UPDATE`, `CASH_ADJUST`, `STORED_VALUE_ADJUST`, `INVENTORY_CORRECTION`, and `PERMISSION_CHANGE` are rejected before persistence. |
| Automation feature gating | HTTP guards remain authoritative and service-level capability checks additionally cover direct service calls and scheduled/background execution. |
| Automation idempotency | Notification dedupe keys, mail-outbox idempotency keys, webhook delivery event IDs, customer preference upserts, and deterministic report step output prevent duplicate external effects after retry/replay. |
| Deterministic insights | Evidence-backed alerts cover low resource utilization, stock variance, elevated refunds, reservation no-shows, KDS degradation, device outage, and explicit-period revenue decline. |
| Owner assistant | A deterministic grounded assistant answers approved owner intents from Phase 14 semantic facts and tenant-scoped customer/membership facts. |
| Evidence contract | Answers carry metric, period, value, comparison, data scope, relevant entities, and limitations. Numeric claims are never provider-only assertions. |
| Unsupported questions | Unsupported/under-specified questions return `UNSUPPORTED`; item-level margin ranking is deliberately refused because Phase 14 does not expose attributable historical item COGS. |
| Prompt injection / arbitrary SQL | Prompt-disclosure, instruction-override and SQL-like requests are rejected. The owner assistant does not execute generated SQL. |
| Tenant isolation / permission | Shop scope comes from the authenticated server actor; controllers require `ai_insights` plus `AI_INSIGHTS_READ`; customer/member lookups include the same `shopId`. |
| Model timeout / fallback | The optional external provider is bounded by an 8-second abort timeout and degrades to the deterministic provider on provider failure/empty response. |
| Rate / cost controls | New insight generation is limited to 30 runs per venue per rolling hour and 50 external-provider runs per venue per UTC day. Exact idempotent replays consume no new budget. |
| No autonomous financial mutation | Existing AI readiness reports `directMutationAllowed: false`; Phase 15 adds no financial mutation path. |

## Durable action semantics

### In-app notification, task, attention

Uses the existing notifications subsystem with `automation:<executionId>:<stepIndex>` as the dedupe key. Task and attention semantics are represented as explicit prefixed operational notifications, preserving one durable user-visible attention stream rather than creating a duplicate task database.

### Email

Uses the existing mail outbox. The same automation execution/step key is the mail idempotency key on every retry.

### SMS

SMS stays provider-neutral. Phase 15 creates an idempotent signed integration/webhook delivery request (`automation.sms.requested`) to a configured venue endpoint rather than introducing an SMS vendor dependency into the automation core.

### Customer tag

Uses a same-tenant `CustomerPreference` key (`tag:<tag>`) with upsert semantics. Replays update the same fact instead of appending duplicate tags.

### Report

Produces deterministic execution-step output from the rule payload and records the payload hash and limitation that no additional facts were inferred.

## Grounded AI policy

GoSpots separates three concepts:

1. Phase 14 owns canonical semantic facts and reconciliation.
2. Phase 15 deterministic insights identify configured conditions and always attach evidence.
3. The optional external AI provider may produce advisory wording/recommendations, but only from redacted metrics and with deterministic fallback.

The owner assistant therefore never becomes a financial authority. A question such as “Which items have the worst margin?” is not answered unless historical item-level cost attribution exists in canonical facts. Refusal is preferred to fabricated precision.

## Tests

Phase 15 permanent tests cover:

- nested deterministic automation conditions;
- rule optimistic-concurrency conflict;
- concurrent dedupe replay;
- stable email idempotency key through retries;
- dead-letter creation after bounded retry failure;
- high-risk autonomous-action rejection;
- service-level feature entitlement;
- grounded resource profitability values;
- grounded busiest-hour values;
- prompt/SQL injection rejection before analytics retrieval;
- unsupported item-margin behavior;
- explicit comparison-period requirement;
- deterministic operational insight evidence;
- rolling-hour generation rate limit;
- daily external-provider cost budget;
- replay without budget consumption;
- legacy provider failure -> deterministic fallback.

Repository CI additionally exercises clean PostgreSQL migration deployment, representative historical upgrade, API tests/build, web typecheck/build/offline suites, Edge tests/build, browser smoke/persisted assertions, standalone-product boundary, and earlier phase regression workflows.

## Migration posture

No Phase 15 schema delta is necessary. This is intentional: all new action definitions and evidence structures fit existing JSON/versioned contracts, and durable side effects reuse existing canonical tables. The complete existing migration chain must still pass both clean-database and representative-upgrade CI before merge.

## Gate P15

The implementation is designed so that **AI can never be the only source for a financial or operational fact**. Financial/operational numbers originate in canonical GoSpots domain/Phase 14 facts; evidence is returned with supported answers, and unsupported facts are refused.

## Stop boundary

Phase 16 production-hardening work is not implemented by this phase.
