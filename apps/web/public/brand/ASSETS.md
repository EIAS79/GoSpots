# GoSpots brand assets

| File | Purpose |
|------|---------|
| `gospots-logo.png` | Horizontal lockup: gold pin + **dark** GoSpots wordmark (light backgrounds). |
| `gospots-logo-light.png` | Same lockup with **white** wordmark (dark hero / dashboard). |
| `gospots-icon.png` | Square app icon (browser tab, apple, `markOnly`). |
| `gospots-og.png` | Social / Open Graph (~1200×630). |

**Also:** `apps/web/src/app/icon.png` — same square icon for Next.js metadata.

Public URLs:

- `/brand/gospots-logo.png`
- `/brand/gospots-logo-light.png`
- `/brand/gospots-icon.png`
- `/brand/gospots-og.png`

Regenerate from ChatGPT exports:

```bash
python apps/web/scripts/process-brand-assets.py
```

The UI sizes the wordmark (~36–56px tall, ~3.14∶1) and does **not** render a second “GoSpots” text next to the image.
