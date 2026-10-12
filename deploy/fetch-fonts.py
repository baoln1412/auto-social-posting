#!/usr/bin/env python3
"""Fetch caption faces that can actually set Vietnamese, as static TTFs.

Three traps this walks around, each hit while writing it:

1. The registry's `vietnamese` subset flag is a promise about the hosted web font, not proof
   the file carries the glyphs. Bebas Neue and Archivo Black — two of the most obvious bold
   caption faces — have none. A missing glyph does not error: PIL draws .notdef and the
   headline silently loses its diacritics. So every file is asked for the hard ones.
2. fonts.googleapis.com serves woff2 to every user agent now, and PIL reads TTF only.
3. Most families ship as ONE variable file. ImageFont.truetype() loads its default instance,
   which is usually Regular — asking for Montserrat 900 and getting 400 is a silent
   downgrade. Variable files are instanced to the wanted weight before they are kept.

Source is github.com/google/fonts, i.e. the upstream OFL/Apache originals.
"""
import io, json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "fonts")
UA = {"User-Agent": "desoul-studio/1.0"}
PROBE = "ễệờựỹĐđắẳộ"          # stacked diacritics, horn vowels, d-stroke

WANT = [
    ("anton", "Anton", 400), ("oswald", "Oswald", 700),
    ("montserrat", "Montserrat", 900), ("robotocondensed", "RobotoCondensed", 900),
    ("barlowcondensed", "BarlowCondensed", 900), ("baloo2", "Baloo2", 800),
    ("rowdies", "Rowdies", 700), ("bigshouldersdisplay", "BigShouldersDisplay", 900),
    ("playfairdisplay", "PlayfairDisplay", 900), ("merriweather", "Merriweather", 900),
    ("lexend", "Lexend", 800), ("mulish", "Mulish", 900),
]


def listing(slug):
    for lic in ("ofl", "apache", "ufl"):
        try:
            u = f"https://api.github.com/repos/google/fonts/contents/{lic}/{slug}"
            d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30))
            return lic, [x["name"] for x in d if x["name"].endswith(".ttf")]
        except Exception:
            continue
    return None, []


def pick(names, weight):
    """A static file at the weight if one exists, else the variable upright file."""
    var = [n for n in names if "[" in n and "Italic" not in n]
    static = [n for n in names if "[" not in n and "Italic" not in n]
    return (var[0], True) if var else ((static[0], False) if static else (None, False))


def main():
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    os.makedirs(OUT, exist_ok=True)
    kept, dropped = [], []
    for slug, name, weight in WANT:
        try:
            lic, names = listing(slug)
            fname, is_var = pick(names, weight)
            if not fname:
                dropped.append((name, "no ttf in repo")); continue
            url = f"https://raw.githubusercontent.com/google/fonts/main/{lic}/{slug}/{urllib.parse.quote(fname)}"
            raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()
            font = TTFont(io.BytesIO(raw))

            cmap = font.getBestCmap()
            missing = [c for c in PROBE if ord(c) not in cmap]
            if missing:
                dropped.append((name, "no Vietnamese: " + "".join(missing))); continue

            if is_var:
                axes = {a.axisTag: (a.minValue, a.maxValue) for a in font["fvar"].axes}
                lo, hi = axes.get("wght", (weight, weight))
                w = max(lo, min(hi, weight))
                font = instancer.instantiateVariableFont(font, {"wght": w})
                if w != weight:
                    name_note = f"{name} (capped at {int(w)})"
                else:
                    name_note = name
                weight = int(w)
            else:
                name_note = name

            dst = os.path.join(OUT, f"{name}-{weight}.ttf")
            font.save(dst)
            kept.append(f"{name}-{weight}")
            print(f"  ok   {name_note:<30} {os.path.getsize(dst)//1024:>4} KB  {lic}")
        except Exception as e:
            dropped.append((name, f"{type(e).__name__}: {str(e)[:50]}"))
    for n, why in dropped:
        print(f"  DROP {n:<30} {why}")
    print(f"\n{len(kept)} kept, {len(dropped)} dropped")
    print("enum:", json.dumps(sorted(kept), ensure_ascii=False))


if __name__ == "__main__":
    import urllib.parse
    sys.exit(main())
