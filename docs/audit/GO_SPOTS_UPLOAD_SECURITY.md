# Locora — Upload & media security

**Date:** 2026-07-21  
**Status:** Phase 0 harden **shipped**; **Phase 1** inventory + migrate tooling + static-serve flag **shipped** (Lane SSSS). **Bible #27 DONE** (Lane **VVVVV**) — ship bar = harden + tooling + default-on gate; live inventory=0 + flag flip is **OPERATOR**. Malware / signed private GET remain Phase 2–3 deferred residuals.  
**Bible:** P2 **#27** — upload security.  
**Ship timing:** Flip `LEGACY_UPLOADS_STATIC=false` only after inventory total is 0.

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
| MIME/magic/size/re-encode/shop delete | Live `inventory:legacy-uploads` → 0 |
| Opaque public GET for published gallery/menu | `LEGACY_UPLOADS_STATIC=false` after zero refs |
| Phase 1 inventory + migrate CLIs | Phase 2 private + signed/auth GET |
| Default-on static gate + boot warn | Phase 3 async malware quarantine |

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

## Explicit non-goals (this wave)

- Changing `GET /media/:id` auth for public gallery/menu.
- Blocking Friday on ClamAV / cloud AV.
- Neon/data migration of legacy paths by agents (operator runs inventory/migrate on live).
