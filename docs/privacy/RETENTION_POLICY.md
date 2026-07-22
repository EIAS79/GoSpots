# Retention policy (draft operational)

**As of:** 2026-07-22  
**Related:** [`DATA_MAP.md`](./DATA_MAP.md), GDPR module + retention processor, [`GO_SPOTS_GDPR_RETENTION.md`](../audit/GO_SPOTS_GDPR_RETENTION.md)

Draft operator policy — align with counsel before public legal claims.

## Principles

1. **Minimize** personal data; prefer hashes for guest-management tokens.  
2. **Financial and audit** records are not erased solely because an account is deleted — anonymize where required.  
3. **DSAR export/erase** flows go through the in-app GDPR module (owner-authenticated).  
4. **Retention jobs** should be idempotent and logged.

## Suggested windows (defaults — configure in product/env as implemented)

| Data class | Suggested retention | Action at expiry |
|------------|---------------------|------------------|
| Guest plaintext contact on closed bookings | Short dual-read window | Clear / hash-only (`clear:guest-plaintext`) |
| Guest management tokens | Event end + grace | Expire / revoke |
| Auth sessions | Until revoke or TTL | Rotate refresh; revoke UI |
| Mail outbox dead letters | Ops review window | Retry or drop after review |
| Marketing analytics events | Product-defined | Aggregate or delete |
| Ledger / completed orders / billed reservations | Legal/financial minimum | Anonymize guest fields; keep amounts |
| Audit logs | Security minimum | Anonymize actor email if erase |

## Account deletion

- Owner erase requests must not destroy required financial history.  
- Replace guest PII with tombstones where rows must remain.  
- Revoke sessions and guest tokens as part of erase.

## Operator checklist

- [ ] Confirm Neon PITR retention matches [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md)  
- [ ] Run retention processor in staging before prod schedule  
- [ ] Document processor list in public privacy policy  
