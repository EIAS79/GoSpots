# 10 — Offline/Edge Continuity, Terminal and Fiscal Device Certification

**Classification:** P12 `COVERED_VERIFY_DEPTH`, physical validation `CURRENT_PROOF_MISSING` | **Priority:** P0 only for sold hardware/offline modes | **Maps:** P12/P17, R7/R11.

## Observed situation and product promise

GoSpots has local Edge Hub code and CI that covers software outage/recovery/rollback. Current Phase 17 lacks fully signed physical-campaign proof for every marketed printer, payment terminal, LAN, kitchen display and fiscal flow. Existing real Adyen S1F4Pro test notes have value but do not close the integrated checkout/money/fiscal suite. **Do not claim internet-free card capture from an ordinary GoSpots offline queue.** Adyen itself distinguishes offline EMV and store-and-forward, requires provider enablement and imposes merchant financial risk. Official [Adyen offline payments](https://docs.adyen.com/point-of-sale/offline-payment/).

## Explicit operating envelope

Define network modes separately: `(A) cloud and WAN healthy`, `(B) WAN down/LAN+Edge alive`, `(C) API down but payment terminals connected independently`, `(D) Edge crash/restart`, `(E) LAN down or device offline`, `(F) full power outage`, `(G) fiscal printer unreachable`, `(H) payment provider service unavailable`. For each operation and mode, publish `ALLOWED_SYNC`, `ALLOWED_DEFERRED`, `READ_ONLY`, `OPERATOR_MANUAL_LEGAL_PROCEDURE`, or `BLOCKED`. Specify **per-sold-hardware capabilities**: devices cannot conjure card authorization or legally required fiscalization merely because app is online/offline-aware.

## Engineering tasks

1. Define Edge command protocol: tenant+venue/device IDs, command ID, monotonic sequence/version, schema version, hash, actor authentication grant, timestamps, locally durable append-only journal and outbox; never replay writes by rebuilding mutable browser state. Encrypt disk and key store; explicitly scope capacity and retention limits.
2. Prove one authority per business fact: Edge may be temporary local authority for a licensed venue scope under fencing/lease; prevent cloud+Edge concurrent billing/reservation during partitions. Conflict policy must be economic: money and customer-value conflicts usually require quarantine, not last-write-wins.
3. State recovery: unacknowledged command retry/idempotent ACK, partial write before crash, Edge disk full, bad upgrade rollback, clock drift, WAN flap, long outage and long after reconnect. Check journal integrity and data loss bounds; customer order cannot disappear after displayed accepted state.
4. Local printing: receipt vs fiscal print vs kitchen ticket vs drawer pulse must have distinct jobs/evidence and exactly-once-or-resolve contract appropriate to device; print duplicate marked copy and reconcile UNKNOWN fiscal outcome, not blind resend.
5. Payment terminal: whitelist supported terminal model + firmware + merchant assignment + network mode; implement provider test matrix (success, decline, cancel, refund, timeout, provider `UNKNOWN`, duplicate notifications and offline provider-authorized scenario if permitted). Do not mark stored-offline card funds captured until provider final reconciliation; display merchant-risk policy and transaction cap.
6. Fiscal printer: use certified adapter according to manufacturer; test offline fiscal legality with Poland advisor, device unavailable, failed paper feed, first-print unknown state, daily closing report if applicable and document retrieval.
7. KDS/other devices: printer routing, duplicate kitchen tickets, customer-facing display, barcode/QR/RFID scanners and lock devices as needed. Document LAN topology, static/discovery identifiers, UPS policy, supported OS/browser and emergency contact.
8. Provisioning: signed device enrollment, certificate/key rotation, lost/stolen device revocation, per-venue allowlist, telemetry visibility and remote diagnostic with owner consent. No raw secrets in printed support logs.

## Mandatory fault drills

- Start live billiard session + food order, drop WAN, Edge continues certified subset; reconnect yields exactly one session/check/order and no price drift.
- Kill Edge process after durable command write and before ACK; restart and replay without duplicate money or food prep.
- Card capture succeeds but terminal response lost; provider status reconciled, never double-initiates new payment.
- Physical payment declined and later card accepted; GuestCheck fully funded once.
- Break printer/fiscal device in middle of sale; keep legally correct queued/blocked status and auditable operator instruction.
- Scan ticket or redeem gift offline twice; support only if double-spend can be prevented; otherwise block.
- Power loss and restart with real device attached; verify actual recovery and any declared RPO/RTO.

## Acceptance deliverables

`hardware-certification-matrix.md` identifies manufacturer/model/firmware/OS/network/config, test result and evidence ID; `offline-operation-policy-by-network-mode.md`, `edge-conflict-campaign.md`, `external-certification-matrix.md`, on-site operator runbook. Only certified devices and modes may appear as supported in contracts/onboarding. **Do not treat synthetic emulator green as hardware certification.**
