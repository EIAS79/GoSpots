# Hardening quality bar (mandatory)

We do **not** rush high-risk work. Incomplete migrations and “half fixes” are worse than waiting.

## Rules

1. **One risk domain at a time** — money, tokens, concurrency, entitlements, CSRF — finish each before starting the next parallel megapatch.
2. **Done means**
   - Schema + migration (if any)
   - All callers updated
   - Types compile (`tsc` / `nest build`)
   - Unit tests for the new path
   - Dual-read / backfill documented when old data exists
   - Implementation report updated with remaining risk
3. **Never leave the tree red** — if a change breaks `nest build`, that change is not merged/continued until green.
4. **No fake completion** — do not claim CSRF / money / ledger / 2FA done unless exit criteria above pass.
5. **Prefer finishing wave 1–2 P0s completely** over starting points 20–40 of the mega-prompt.

## Current priority (ordered)

1. Make API typecheck/build green after Decimal + guest-token WIP
2. Finish guest-token dual-read end-to-end (all status/cancel/chat paths)
3. Verify webhook + stock + booking locks still green with tests
4. Only then: ledger / CSRF / entitlements polish
