#!/usr/bin/env python3
"""Put our screen beside the reference screen it answers.

    pair-shot.py <slice>-<screen> <ours.png> <ref.jpg> ["left label" "right label"]

Writes tests/shots/pairs/<slice>-<screen>.png. The pair IS the acceptance test for UX
parity — "looks fine to me" does not close a slice — so it is committed with the code.

Both images are scaled to one height and captioned, because a pair with no labels stops
being evidence the moment anyone but the author looks at it.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

H = 900          # one height for both panels
GAP = 16
BAR = 28
BG = (232, 229, 222)
INK = (28, 26, 24)

FONTS = [
    "/System/Library/Fonts/SFNSMono.ttf",
    "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
    "/Library/Fonts/Arial.ttf",
]


def font(size: int):
    for f in FONTS:
        if Path(f).exists():
            try:
                return ImageFont.truetype(f, size)
            except OSError:
                pass
    return ImageFont.load_default()


def panel(path: str) -> Image.Image:
    im = Image.open(path).convert("RGB")
    # Tall full-page shots would squash the reference to a stripe; crop to the fold instead.
    if im.height > im.width * 1.4:
        im = im.crop((0, 0, im.width, int(im.width * 1.4)))
    w = max(1, round(im.width * H / im.height))
    return im.resize((w, H), Image.LANCZOS)


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    name, ours_p, ref_p = sys.argv[1:4]
    left = sys.argv[4] if len(sys.argv) > 4 else "OURS"
    right = sys.argv[5] if len(sys.argv) > 5 else "REFERENCE"

    a, b = panel(ours_p), panel(ref_p)
    out = Image.new("RGB", (a.width + GAP + b.width, H + BAR), BG)
    d = ImageDraw.Draw(out)
    f = font(15)
    d.text((8, 6), f"{left}  ·  {name}", INK, font=f)
    d.text((a.width + GAP + 8, 6), right, INK, font=f)
    out.paste(a, (0, BAR))
    out.paste(b, (a.width + GAP, BAR))

    dest = Path("tests/shots/pairs") / f"{name}.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest)
    print(dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
