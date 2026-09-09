"""Reject any bundled font that cannot set Vietnamese.

Stacked diacritics are where display fonts fail: many faces that look right in English
render tofu or collide marks on 'ế ộ ữ ằ'. Run this before adding a font to a preset.

    python3 deploy/check-fonts.py            # every ttf in public/fonts
    python3 deploy/check-fonts.py Anton      # one face
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont
import caption_style

TORTURE = "ĐƯỜNG GIỮ TRỤC XUẤT NGHIỆP Ỗ Ữ Ằ Ế Ộ ỹ ặ"
UNASSIGNED = chr(0xE000)        # private use area: every font draws .notdef here

def _mask(font, ch):
    img = Image.new("L", (200, 200), 0)
    ImageDraw.Draw(img).text((10, 10), ch, font=font, fill=255)
    return img.tobytes()

def check(name):
    path = caption_style.font_path(name)
    if not os.path.exists(path):
        return [f"{name}: file not found at {path}"]
    font = ImageFont.truetype(path, 72)
    tofu = _mask(font, UNASSIGNED)
    bad = []
    for ch in sorted(set(TORTURE.replace(" ", ""))):
        if _mask(font, ch) == tofu:
            bad.append(ch)
    if bad:
        return [f"{name}: missing glyph(s) {' '.join(bad)}"]
    # A blank render means the face produced nothing at all.
    if _mask(font, "Ế") == _mask(font, " "):
        return [f"{name}: renders blank for Ế"]
    return []

def main():
    names = sys.argv[1:] or [f[:-4] for f in sorted(os.listdir(caption_style.FONT_DIR))
                             if f.lower().endswith(".ttf")]
    problems = []
    for n in names:
        errs = check(n)
        print(("  FAIL " if errs else "  ok   ") + n)
        problems += errs
    if problems:
        print("\n".join(problems)); sys.exit(1)
    print(f"all {len(names)} font(s) set Vietnamese cleanly")

if __name__ == "__main__":
    main()
