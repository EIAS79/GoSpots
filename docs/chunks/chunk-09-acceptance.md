# Chunk 09 acceptance checklist

**Status:** DONE — engineering acceptance gate passed and merged.

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
- [x] Exact final PR-head CI green — PR #22 head `03dfe8d5e43b7cf870ecd057215bbfbaecfabc9a`, GitHub Actions CI #261.
- [x] Post-merge `main` CI green — merge commit `5b28738e567f9f6fca33bb8d391a9d47dc8e1213`, GitHub Actions CI #262.

Chunk 09 is therefore complete as the single-browser/device Offline Lite increment. Its deliberate scope boundaries remain in force; multi-device LAN authority is Chunk 10.
