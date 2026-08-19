# Supported browser and device matrix

Status: Phase 16 baseline. This is the support contract; it intentionally does not claim “works everywhere.”

## Web application

| Client | Support tier | Required proof |
|---|---|---|
| Chrome / Chromium — current stable | Tier 1 | blocking Playwright Chromium E2E + production smoke |
| Microsoft Edge — current stable | Tier 1 | Chromium engine; manual/production smoke on representative Windows venue device before marketed hardware bundle |
| Chrome on Android — current stable | Tier 2 | responsive/touch layout validation on representative device |
| Safari on iOS/iPadOS — current stable | Tier 2 | responsive/touch validation on representative device before marketed iPad bundle |
| Safari on macOS — current stable | Tier 2 | manual smoke for owner/admin workflows |
| Firefox — current stable | Best effort until dedicated blocking suite exists | no browser-specific guarantee beyond standards-compatible UI |
| Internet Explorer / legacy EdgeHTML | Unsupported | do not troubleshoot as a product defect |

“Current stable” means the latest generally available vendor release at the time the venue is onboarded. Venue-managed browsers should receive security updates.

## Screen / input baseline

- cashier/owner web: 390 px CSS viewport width and above;
- primary POS/tablet: touch and keyboard/mouse must both remain usable;
- routine interactive targets: Phase 16 browser regression rejects visible controls below 32×32 CSS px on the tested operator shell;
- keyboard focus must be visible;
- no routine workflow may require hover-only input;
- error text/status may not rely on color alone.

## Edge Hub

Edge is supported only on the OS/runtime/device profiles explicitly certified in the hardware matrix. Phase 12 Node tests cover durable replay/restart/outage semantics; physical LAN/power/device proof remains tied to the marketed hardware model.

## KDS / printers / terminals / scanners / displays

A hardware family is supported only when its model has a completed certification record under the master Hardware Certification Matrix. Browser support does not imply peripheral support.

## Release policy

Adding a new guaranteed browser/device family requires:

1. a named support tier;
2. a repeatable smoke/E2E procedure;
3. representative physical proof where hardware-specific behavior matters;
4. update of the operations runbook if failure/recovery behavior changes.
