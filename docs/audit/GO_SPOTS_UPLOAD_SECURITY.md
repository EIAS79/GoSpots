# Locora — Upload & media security

**Date:** 2026-07-21 (Phase 0–1 ship) / 2026-07-22 (residual docs lane **UPLOAD26-residual-docs**)  
**Status:** Phase 0 harden + Phase 1 inventory/migrate tooling + `LEGACY_UPLOADS_STATIC` gate **shipped** (Lanes **SSSS**, **VVVVV**). **§26 classification: PARTIAL** — ship bar met for ingest hardening + legacy cutover tooling; live inventory=0 + flag flip is **OPERATOR**; private/signed GET + malware scan remain Phase 2–3 **residual**. Legacy matrix **#27 DONE** = that ship bar only — not full §26 closure.  
**Bible:** P2 **§26** (legacy matrix **#27**).  
**Ship timing:** Flip `LEGACY_UPLOADS_STATIC=false` only after inventory total is 0.

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| MIME allowlist (JPEG/PNG/WebP/GIF/AVIF) | **DONE** | `image-media.util.ts` + multer `fileFilter` |
| Magic-byte sniff (ignore client `Content-Type`) | **DONE** | `sniffImageMime` + `assertImageUploadFile` |
| Size cap (8 MiB) + memory storage | **DONE** | `IMAGE_UPLOAD_MAX_BYTES`; `imageUploadMulterOptions` |
| Re-encode → WebP + gzip in `StoredImage` | **DONE** | `compressImageForStorage` (sharp) |
| Shop-scoped delete | **DONE** | `MediaService.deleteByMediaPath` (`id` + `shopId`) |
| Safe media id / path parse | **DONE** | `assertSafeMediaId`, `parseMediaPath`, `isLegacyUploadPath` |
| Opaque public `GET /media/:id` (published gallery/menu) | **DONE** (accepted residual) | No auth; cuid capability; immutable cache |
| CORS `*` removed on media GET; CORP for embed | **DONE** | Controller + Helmet |
| Phase 1 legacy inventory CLI | **DONE** | `legacy-uploads.util.ts`; `pnpm inventory:legacy-uploads` |
| Phase 1 legacy migrate CLI (dry-run default) | **DONE** | `legacy-uploads-migrate.util.ts`; `pnpm migrate:legacy-uploads` |
| `LEGACY_UPLOADS_STATIC` gate (default **on**) + boot warn | **DONE** | `main.ts`; `isLegacyUploadsStaticEnabled` |
| No new disk writers on upload path | **DONE** | New uploads → `StoredImage` only |
| Live legacy ref count = 0 | **OPERATOR** | Run inventory on prod/staging DB |
| Migrate remaining `/uploads/…` → `/media/:id` | **OPERATOR** | `--apply` when disk files exist |
| Disable static `/api/v1/uploads/` | **OPERATOR** | `LEGACY_UPLOADS_STATIC=false` only when inventory **0** |
| Delete host `uploads/` tree | **OPERATOR / later** | After flag off + soak |
| `StoredImage.visibility` / private assets | **RESIDUAL** Phase 2 | No schema column on disk |
| Signed or auth GET for private media | **RESIDUAL** Phase 2 | Public published GET unchanged by design |
| Async malware / AV quarantine | **RESIDUAL** Phase 3 | Re-encode mitigates polyglot; no ClamAV/vendor |
| Object-storage offload (S3/R2) | **RESIDUAL** Phase 3 | Bytes in Postgres today |

**§26 classification:** **PARTIAL** — ingest + legacy tooling ship bar met; operator cutover + Phase 2–3 documented here, not hidden.

---

## What is shipped today

| Control | Where | Notes |
|---------|--------|--------|
| MIME allowlist | `image-media.util` + multer `fileFilter` | JPEG / PNG / WebP / GIF / AVIF only |
| Magic-byte sniff | `sniffImageMime` + `assertImageUploadFile` | Client `Content-Type` alone is insufficient |
| Size cap | `IMAGE_UPLOAD_MAX_BYTES` (8 MiB) + multer `limits` | Memory storage (no disk write on upload path) |
| Re-encode | `compressImageForStorage` (sharp → WebP + gzip) | Strip exotic payloads; store normalized bytes in `StoredImage` |
| Shop-scoped delete | `MediaService.deleteByMediaPath` | `deleteMany({ where: { id, shopId } })` |
| Safe id parse | `assertSafeMediaId` / `parseMediaPath` | Reject traversal / odd path chars |
| Legacy path guard | `isLegacyUploadPath` | Strict `/uploads/` prefix; reject `..` / `\` / NUL |
| CORS on media GET | Controller comment + global CORS | No `Access-Control-Allow-Origin: *` on media (removed 2026-07-20) |
| CORP | Helmet + media response + static uploads | `cross-origin` so Next can embed API images |
| **Phase 1 inventory** | `legacy-uploads.util` + `pnpm inventory:legacy-uploads` | Counts `/uploads/` refs on shop/menu/gallery/resources columns |
| **Phase 1 migrate** | `legacy-uploads-migrate.util` + `pnpm migrate:legacy-uploads` | Dry-run default; `--apply` → disk → `StoredImage` → `/media/:id` |
| **Phase 1 static gate** | `main.ts` + `LEGACY_UPLOADS_STATIC` | Default **on** (serve); boot warn; set `false` only when inventory = 0 |

**Storage model:** `StoredImage` rows are shop-owned (`shopId` + cascade). Public serve path is `GET /api/v1/media/:id` — **no auth**, opaque cuid is the capability secret. Long cache: `public, max-age=31536000, immutable`.

**Legacy disk:** `main.ts` mounts `useStaticAssets(..., { prefix: '/api/v1/uploads/' })` **only when** `LEGACY_UPLOADS_STATIC` is not `false|0|off|no` (default on). New uploads never write disk; callers may still hold `/uploads/...` until migrate/re-upload.

**Specs:** `image-media.util.spec.ts` + `legacy-uploads.util.spec.ts` (flag + path resolve).

---

## Ship bar vs residuals (Lane VVVVV)

| In DONE ship bar | Operator / later |
|------------------|------------------|
| MIME/magic/size/re-encode/shop delete | Live `inventory:legacy-uploads` → 0 — **Gates 1–3** |
| Opaque public GET for published gallery/menu | `LEGACY_UPLOADS_STATIC=false` after zero refs — **Gate 3** |
| Phase 1 inventory + migrate CLIs | Phase 2 private + signed/auth GET — **residual checklist** |
| Default-on static gate + boot warn | Phase 3 async malware quarantine — **residual checklist** |

See **Operator checklist (Gates 0–5)** and **Phase 2–3 residual checklists** below.

---

## Residual risks (honest)

| Risk | Severity | Why it remains |
|------|----------|----------------|
| **Opaque public GET** | P2 accepted residual | Venue pages need unauthenticated `<img src>`; guessing a cuid is hard but leaked URLs are world-readable forever (immutable cache). |
| **No malware / AV scan** | Deferred Phase 3 | Re-encode reduces polyglot risk; does not prove “clean.” |
| **Legacy `/uploads` static (default on)** | OPERATOR | Disk tree still served until operator inventory=0 + flag off; no shop scoping on GET. **No new disk writers.** |
| **Cross-tenant read if id leaks** | Ties #3 | `findUnique({ where: { id } })` — intentional for public assets. |
| **SVG / executable MIME** | Mitigated for uploads | Not in allowlist; sniff rejects non-image. |

---

## Design decisions (post-Friday Phase 2–3)

### A. Keep public gallery/menu on opaque GET

**Do not** require signed URLs for **published** venue gallery / menu / cover images.

### B. Introduce visibility for non-public assets (Phase 2)

Add visibility / purpose on `StoredImage` for `shop_private` → auth or short-lived signed URL.

### C. Signed URLs — only for private (Phase 2–3)

HMAC `id|exp` for private assets only; keep opaque public GET for published images.

### D. Malware / content scanning (Phase 3)

Async scan after store if abuse appears; do not block ship on AV vendor.

### E. Retire legacy `/uploads` (Phase 1 tooling shipped)

1. `pnpm run inventory:legacy-uploads`
2. `pnpm run migrate:legacy-uploads -- --dry-run` then `--apply`
3. When inventory total is **0**: `LEGACY_UPLOADS_STATIC=false`
4. Eventually delete host `uploads/` tree

**Unsafe without operator inventory:** flipping the flag off blindly would 404 remaining legacy `<img>` URLs. Default stays **on**.

---

## Phased rollout

| Phase | When | Scope |
|-------|------|--------|
| **0** | **Shipped** | MIME/magic/size/re-encode/shop delete; opaque public GET accepted. |
| **1** | **Shipped (tooling)** | Inventory + migrate-to-`StoredImage` scripts; `LEGACY_UPLOADS_STATIC` gate + boot warn. |
| **DONE bar** | **Lane VVVVV** | Phases 0–1 + operator note for inventory=0. |
| **2** | Post-submit | `visibility` / private media; signed or auth GET for private only. |
| **3** | If needed | Async malware scan + quarantine; object-storage offload. |

---

## Operator checklist — legacy `/uploads` cutover (Gates 0–5)

Run on **staging first**, then production. Do not flip `LEGACY_UPLOADS_STATIC=false` until Gate 3 passes.

### Gate 0 — Baseline (code shipped)

- [x] MIME/magic/size/re-encode + shop-scoped delete on upload path
- [x] `inventory:legacy-uploads` + `migrate:legacy-uploads` scripts on disk
- [x] `LEGACY_UPLOADS_STATIC` default **on** + boot warn in `main.ts`

**Exit:** App deploy includes Phase 0–1 upload security slice.

### Gate 1 — Inventory (OPERATOR)

- [ ] `pnpm --filter @gospots/api run inventory:legacy-uploads` against target DB
- [ ] Record per-column counts + **total** (shop cover, menu, gallery, resources, etc.)
- [ ] If total > 0: confirm disk files exist under host `uploads/` for listed paths

**Exit:** Known legacy ref count; no blind flag flip.

### Gate 2 — Migrate (OPERATOR)

- [ ] `pnpm --filter @gospots/api run migrate:legacy-uploads -- --dry-run` — review diff
- [ ] `pnpm --filter @gospots/api run migrate:legacy-uploads -- --apply` when disk files present
- [ ] Re-run inventory — expect total **0** (or documented exceptions)

**Exit:** DB columns point at `/media/:id`; legacy paths only on disk with zero refs.

### Gate 3 — Disable static serve (OPERATOR)

- [ ] Inventory total confirmed **0**
- [ ] Set `LEGACY_UPLOADS_STATIC=false` in prod env
- [ ] Redeploy / restart API — boot log confirms static disabled
- [ ] Smoke: published venue pages load gallery/menu/cover images via `/media/:id`

**Exit:** `/api/v1/uploads/` returns 404; no broken public `<img>` on sampled venues.

### Gate 4 — Disk cleanup (OPERATOR / later)

- [ ] Archive host `uploads/` tree if needed for audit
- [ ] Remove disk tree from API host after soak window
- [ ] Document in submit notes: legacy upload path retired

**Exit:** No orphaned disk files on API host.

### Gate 5 — Submit honesty

- [ ] Note in deploy/submit docs: **§26 PARTIAL** — ingest + tooling **DONE**; private/signed GET + AV **residual** ([`GO_SPOTS_UPLOAD_SECURITY.md`](./GO_SPOTS_UPLOAD_SECURITY.md))

**Exit:** Reviewers see honest residual, not “uploads fully closed.”

---

## Residual checklist — Phase 2 (private media)

**Trigger:** Need staff-only uploads (draft menu, internal docs) or revoke leaked public URLs without rotating cuid.

| Work | Notes |
|------|--------|
| Schema | Add `StoredImage.visibility` (`public` \| `shop_private`) — default `public` for existing rows |
| Upload API | Set visibility on create; reject public embed of `shop_private` in published DTOs |
| GET policy | `public` → keep opaque unauthenticated GET; `shop_private` → session JWT or signed URL |
| Signed URLs | HMAC `id\|exp` for private only; short TTL; published gallery/menu unchanged |
| Delete / rotate | Owner can delete private assets; optional cuid rotation on leak |
| Tests | Visibility matrix; signed URL expiry; IDOR on private id without auth |

**Non-goals:** Require auth on published venue gallery/menu images.

**Exit:** Private assets not world-readable; public path unchanged.

---

## Residual checklist — Phase 3 (malware + scale)

**Trigger:** Abuse reports, enterprise AV ask, or Postgres byte pressure.

| Work | Notes |
|------|--------|
| Async scan queue | Post-store job; quarantine flag on `StoredImage` until clean |
| AV vendor | ClamAV sidecar or cloud API — fail-open vs block is product decision |
| Admin UX | Quarantined row visible to owner; re-upload path |
| Object storage | Optional S3/R2 for bytes; DB keeps metadata + shop scope |
| Metrics | Upload reject rate; scan latency; quarantine count |

**Non-goals:** Block Friday ship on AV; synchronous scan on upload hot path.

**Exit:** Documented scan path; quarantine does not break public published GET for clean rows.

---

## Explicit non-goals (this wave)

- Changing `GET /media/:id` auth for public gallery/menu.
- Blocking Friday on ClamAV / cloud AV.
- Neon/data migration of legacy paths by agents (operator runs inventory/migrate on live).
