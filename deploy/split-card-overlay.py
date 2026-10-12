#!/usr/bin/env python3
"""Split the brand overlay art into a gradient plate and a movable badge.

The classic card used to lay down ONE PNG per ratio holding both the blue gradient and the
101 badge. The badge cannot move while it is baked into that, so the card route draws the
two separately — and this derives them from whatever art is currently shipped.

A script, not a one-off: the art is redrawn (fd45d6f moved the badge from 844,38 178x178 to
848,29 203x177 and nothing noticed, because the derived files were hand-made once). Run this
after any change to public/overlays/card-bg-*.png and paste the printed box into
lib/studio/card/placement.ts — tests/unit/card-placement.test.ts measures the art and fails
if the two disagree.

The two parts are disjoint by construction: the badge sits in the top band, the gradient
starts hundreds of rows below it, and the rows between are fully transparent.
"""
import sys, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OVER = os.path.join(os.path.dirname(HERE), "public", "overlays")
RATIOS = {"4x5": "card-bg-4x5.png", "1x1": "card-bg-1x1.png"}


def bands(im):
    """Opaque row ranges, so the badge and the gradient can be told apart."""
    w, h = im.size
    px = im.split()[3].load()
    out, run = [], None
    for y in range(h):
        if any(px[x, y] > 4 for x in range(0, w, 4)):
            if run is None:
                run = y
        elif run is not None:
            out.append((run, y)); run = None
    if run is not None:
        out.append((run, h))
    return out


def badge_box(im):
    """The badge's exact box: the first opaque band, trimmed to its own ink."""
    b = bands(im)
    if len(b) < 2:
        raise SystemExit("art has no separate badge band — did the gradient grow into it?")
    top, bot = b[0]
    bb = im.crop((0, top, im.size[0], bot)).getbbox()
    return bb[0], top + bb[1], bb[2] - bb[0], bb[3] - bb[1]


def main():
    boxes = {}
    for name, f in RATIOS.items():
        im = Image.open(os.path.join(OVER, f)).convert("RGBA")
        boxes[name] = badge_box(im)

    if len(set(boxes.values())) != 1:
        raise SystemExit(f"the badge sits differently per ratio {boxes} — one constant cannot serve both")
    x, y, w, h = boxes["4x5"]

    src = Image.open(os.path.join(OVER, RATIOS["4x5"])).convert("RGBA")
    src.crop((x, y, x + w, y + h)).save(os.path.join(OVER, "card-logo.png"))

    for name, f in RATIOS.items():
        im = Image.open(os.path.join(OVER, f)).convert("RGBA")
        im.paste((0, 0, 0, 0), (x, y, x + w, y + h))   # erase, not blend: exact RGBA stays exact
        im.save(os.path.join(OVER, f"card-grad-{name}.png"))
        print(f"  wrote card-grad-{name}.png")
    print(f"  wrote card-logo.png  {w}x{h}")
    print(f"\nexport const LOGO = {{ x: {x}, y: {y}, w: {w}, h: {h} }};")


if __name__ == "__main__":
    sys.exit(main())
