# GoSpots — Engineering Decision Log

## 2026-10-09 — D-001: Use verified-provider capture as sole generic card authority
Decision: the generic checkout payment endpoint records non-card tender; a MANUAL_CARD success requires internal captured-provider finalization with verified CAPTURED operation, exact amount/currency, matching shop and settlement. Preserve old stored MANUAL_CARD rows without rewriting them. Do not introduce a manual attestation endpoint in this fix.
Reason: generic caller could previously claim money paid with no provider capture. The existing Adyen checkout legitimately records MANUAL_CARD after capture; blocking its internal path would cause a captured-but-unallocated reconciliation incident.
Status: Implementation pending exact-head focused CI and provider regression. No schema migration proposed.

## 2026-10-09 — D-002: Deployment and data safety
Decision: no main writes, no production payments, no fiscal activity, no destructive database migrations and no Edulytics environment use. Source file `apps/web/vercel.json` disables non-main Git deployments; external Vercel account binding not verified and must be rechecked before production promotion.
Status: Follow release gate and user approval for main merge or deployment.
