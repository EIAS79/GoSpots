# Chunk 09 acceptance checklist

- [x] Service worker provides app-shell/static resilience and never caches API responses.
- [x] IndexedDB keeps cached open checks and queued local work across browser refresh.
- [x] Minimal auth + venue shell snapshots allow an entitled already-open dashboard to recover from transient WAN loss without persisting credentials.
- [x] Local data is namespaced by user + Shop and purged on logout/session revocation/venue switch.
- [x] Stable operation IDs and payload hashes drive durable replay receipts.
- [x] Reconnect replay reuses completed receipts and cannot duplicate the same offline operation.
- [x] Check updates use expected versions and conflict instead of overwriting newer server state.
- [x] Ambiguous online mutations are never converted into new local mutations after dispatch.
- [x] Conflict/failed operations are operator-visible and never auto-overwritten.
- [x] Card payments, fiscalization, KSeF, refunds, SaaS billing and final financial reconciliation are clearly online-only.
- [x] Order and gaming write candidates remain explicitly disabled until authoritative conflict rules exist.
- [x] Elapsed-time math is local; no 1-second API write loop exists.
- [x] Offline Lite activation is guarded by the per-Shop `offline_lite` feature flag in browser activation and server replay.
- [ ] Exact final PR-head CI green.
- [ ] Post-merge `main` CI green.

The final two boxes are checked in the PR/merge record only after their GitHub Actions runs succeed.
