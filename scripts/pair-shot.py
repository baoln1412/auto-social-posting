#!/usr/bin/env python3
"""Put our screen beside the reference screen it answers.

    pair-shot.py <slice>-<screen> <ours.png> <ref.jpg> ["left label" "right label"]
    pair-shot.py <slice>-<screen> <ours.png> <mock.png> <ref.jpg> --triple ["ours" "mock" "ref"]

v3 (2026-09-24) added the triple: the approved mock sits between ours and the reference, so
the pair answers "did we build the drawing" and "does the drawing answer the reference" at once.

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
    args = [x for x in sys.argv[1:] if x != "--triple"]
    triple = "--triple" in sys.argv
    name = args[0]
    paths = args[1:4] if triple else args[1:3]
    labels = args[4:] if triple else args[3:]
    defaults = ["OURS", "MOCK", "REFERENCE"] if triple else ["OURS", "REFERENCE"]
    labels = labels + defaults[len(labels):]

    panels = [panel(p) for p in paths]
    out = Image.new("RGB", (sum(p.width for p in panels) + GAP * (len(panels) - 1), H + BAR), BG)
    d = ImageDraw.Draw(out)
    f = font(15)
    x = 0
    for i, (im, label) in enumerate(zip(panels, labels)):
        d.text((x + 8, 6), f"{label}  ·  {name}" if i == 0 else label, INK, font=f)
        out.paste(im, (x, BAR))
        x += im.width + GAP

    dest = Path("tests/shots/pairs") / f"{name}.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest)
    print(dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
