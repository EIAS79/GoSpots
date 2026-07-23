"""Strip faux checkerboard backgrounds from ChatGPT brand exports."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = Path(
    r"C:\Users\codin\AppData\Roaming\Cursor\User\workspaceStorage"
    r"\c24b62778b83c12a251c9074de0d4c53\images"
)

LOGO_SRC = ASSETS / (
    "ChatGPT Image Jul 23, 2026, 12_16_53 PM (1)-be574116-848e-4d80-9896-eadf7acace39.png"
)
ICON_SRC = ASSETS / (
    "ChatGPT Image Jul 23, 2026, 12_16_53 PM (2)-3a47c078-9e1f-44de-8b6d-46bb0b7a101d.png"
)

OUT_DIR = ROOT / "public" / "brand"
APP_ICON = ROOT / "src" / "app" / "icon.png"
PUBLIC_ROOT = ROOT / "public" / "gospots.png"


def crop_transparent(im: Image.Image, pad: int = 8) -> Image.Image:
    bbox = im.split()[-1].getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    return im.crop(
        (
            max(0, l - pad),
            max(0, t - pad),
            min(im.width, r + pad),
            min(im.height, b + pad),
        )
    )


def remove_checkerboard(
    im: Image.Image,
    *,
    bright_cut: float = 200,
    chroma_cut: float = 28,
) -> Image.Image:
    rgba = np.array(im.convert("RGBA"), dtype=np.float32)
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    chroma = mx - mn
    avg = (r + g + b) / 3.0

    # White / light-gray checker tiles (neutral + bright)
    is_bg = (chroma <= chroma_cut) & (avg >= bright_cut)
    is_bg |= (chroma <= 18) & (avg >= 175) & (avg < bright_cut)

    # Soft fringe near checker anti-alias
    near = (chroma <= chroma_cut + 10) & (avg >= bright_cut - 35) & ~is_bg
    keep_strong = (avg < 140) | (chroma > chroma_cut + 15)
    near &= ~keep_strong
    fade = np.clip((bright_cut - avg) / 40.0, 0, 1)
    a = np.where(near, a * fade, a)
    a = np.where(is_bg, 0, a)

    rgba[..., 3] = a
    mask0 = a <= 0
    rgba[..., 0][mask0] = 0
    rgba[..., 1][mask0] = 0
    rgba[..., 2][mask0] = 0

    return crop_transparent(Image.fromarray(rgba.astype(np.uint8), "RGBA"))


def to_square(im: Image.Image) -> Image.Image:
    w, h = im.size
    side = max(w, h)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - w) // 2, (side - h) // 2), im)
    return sq


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)
    print(f"wrote {path} size={im.size}")


def make_light_wordmark(im: Image.Image) -> Image.Image:
    """Dark navy wordmark → white so the lockup reads on dark chrome."""
    rgba = np.array(im.convert("RGBA"), dtype=np.float32)
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    h, w = rgba.shape[:2]
    xs = np.arange(w)[None, :].repeat(h, axis=0)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    chroma = mx - mn
    avg = (r + g + b) / 3.0

    is_gold = (chroma > 40) & (r > 140) & (r >= g) & (g > b)
    in_text_zone = xs > w * 0.26
    is_letter = (
        in_text_zone
        & (a > 5)
        & (~is_gold)
        & (avg < 210)
        & ~((avg > 200) & (chroma < 25))
    )

    rgba[..., 0] = np.where(is_letter, 255, r)
    rgba[..., 1] = np.where(is_letter, 255, g)
    rgba[..., 2] = np.where(is_letter, 255, b)

    return Image.fromarray(rgba.astype(np.uint8), "RGBA")


def main() -> None:
    logo = remove_checkerboard(Image.open(LOGO_SRC), bright_cut=200, chroma_cut=30)
    icon = remove_checkerboard(Image.open(ICON_SRC), bright_cut=198, chroma_cut=26)
    icon_sq = to_square(icon)
    logo_light = make_light_wordmark(logo)

    save_png(logo, OUT_DIR / "gospots-logo.png")
    save_png(logo_light, OUT_DIR / "gospots-logo-light.png")
    save_png(icon, OUT_DIR / "gospots-icon.png")
    save_png(icon_sq, APP_ICON)
    save_png(icon_sq, PUBLIC_ROOT)

    # Simple dark OG card with centered app icon
    og = Image.new("RGBA", (1200, 630), (9, 9, 11, 255))
    thumb = icon.copy()
    thumb.thumbnail((420, 420), Image.Resampling.LANCZOS)
    og.paste(
        thumb,
        ((1200 - thumb.width) // 2, (630 - thumb.height) // 2 - 20),
        thumb,
    )
    og.convert("RGB").save(OUT_DIR / "gospots-og.png", "PNG", optimize=True)
    print(f"wrote {OUT_DIR / 'gospots-og.png'} size=(1200, 630)")

    for label, im in (("logo", logo), ("logo_light", logo_light), ("icon", icon)):
        arr = np.array(im)
        opaque = float((arr[..., 3] > 10).mean())
        corners = [tuple(int(v) for v in arr[y, x]) for y, x in ((0, 0), (0, -1), (-1, 0), (-1, -1))]
        print(label, "opaque_ratio", round(opaque, 3), "corners", corners)


if __name__ == "__main__":
    main()
