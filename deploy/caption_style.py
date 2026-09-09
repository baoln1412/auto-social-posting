"""Caption style resolution: preset + per-post overrides -> one flat style dict.

Pure logic - no PIL, no network - so it self-checks offline with --demo.
The preset table lives in deploy/assets/caption-presets.json and is read by the
Next UI too; one file, so the two sides cannot drift apart.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRESETS_PATH = os.path.join(ROOT, "deploy", "assets", "caption-presets.json")
FONT_DIR = os.path.join(ROOT, "public", "fonts")

# These values ARE the current hardcoded look (render_cue's fontsize=64/stroke=7,
# CAP_BASE white, CAP_ACTIVE yellow, CAP_Y=780 of H=1920, align_cues size=5). A post
# with no style stored renders exactly what it rendered before this feature existed.
DEFAULTS = {
    "preset": "classic",
    "font": "BeVietnamPro-Bold",
    "size": 64,
    "case": "none",                                        # none | upper
    "color": "#FFFFFF",
    "outline": {"color": "#000000", "w": 7},
    "shadow": {"dx": 0, "dy": 0, "color": "#000000B3"},     # dy 0 == shadow off
    "highlight": {"mode": "word", "color": "#FFDD00", "bg": None},  # word | block | none
    "pos": 855 / 1920,                                      # centre of the historical 150px band (780 + 150/2)
    "wordsPerCue": 5,
    "maxLines": 2,
}

CLAMPS = {"size": (24, 160), "pos": (0.0, 0.95), "wordsPerCue": (1, 12), "maxLines": (1, 4)}

def load_presets():
    try:
        with open(PRESETS_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"classic": {"label": "101 Classic"}}   # never let a bad file kill a render

def _deep_merge(base, over):
    """Nested dicts merge key-by-key; a preset that sets only highlight.color must not
    wipe highlight.mode."""
    out = dict(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out

def parse_color(s):
    """#RGB / #RRGGBB / #RRGGBBAA -> RGBA. Anything unparseable falls back to opaque
    white rather than raising: a typo in a colour field must not kill a whole render."""
    try:
        t = str(s).lstrip("#").strip()
        if len(t) == 3:
            t = "".join(c * 2 for c in t)
        if len(t) == 6:
            t += "FF"
        if len(t) != 8:
            return (255, 255, 255, 255)
        return tuple(int(t[i:i + 2], 16) for i in (0, 2, 4, 6))
    except Exception:
        return (255, 255, 255, 255)

def resolve(style):
    """DEFAULTS <- preset <- explicit overrides, then clamp. Always returns a complete
    dict, so callers never have to test for a missing key."""
    style = style or {}
    name = style.get("preset") or "classic"
    preset = load_presets().get(name)
    if preset is None:
        name, preset = "classic", {}
    preset = {k: v for k, v in preset.items() if k != "label"}
    out = _deep_merge(_deep_merge(DEFAULTS, preset), style)
    out["preset"] = name
    for key, (lo, hi) in CLAMPS.items():
        try:
            out[key] = min(hi, max(lo, type(DEFAULTS[key])(out.get(key, DEFAULTS[key]))))
        except Exception:
            out[key] = DEFAULTS[key]
    if out.get("case") not in ("none", "upper"):
        out["case"] = "none"
    if out.get("highlight", {}).get("mode") not in ("word", "block", "none"):
        out["highlight"]["mode"] = "word"
    return out

def line_height(st):
    return st["size"] + 14              # matches render_cue's historical lh

def band_height(st):
    """The caption band is derived, not fixed. CAP_H was 150 while two lines at 64px
    already needed 156 - today's output clips ~3px off the top line, and a 92px preset
    would clip badly. Half a font-size of padding covers descenders, stroke and shadow."""
    return int(line_height(st) * st["maxLines"] + st["size"] * 0.5)

def cap_y(st, frame_h):
    """Top edge of the band, derived from `pos` as the band's CENTRE line and kept fully
    inside the frame. Centre rather than top edge so captions hold their position when the
    font size changes - a taller band grows symmetrically instead of pushing text down."""
    top = int(st["pos"] * frame_h - band_height(st) / 2)
    return max(0, min(top, frame_h - band_height(st)))

def font_path(name):
    p = os.path.join(FONT_DIR, f"{name}.ttf")
    return p if os.path.exists(p) else os.path.join(FONT_DIR, "BeVietnamPro-Bold.ttf")

def demo():
    s = resolve(None)
    assert s["size"] == 64 and s["color"] == "#FFFFFF", s
    assert s["outline"] == {"color": "#000000", "w": 7}, s
    assert s["highlight"]["color"] == "#FFDD00", s
    assert s["wordsPerCue"] == 5, s
    # The regression guard for "101 Classic": text must land where it always has.
    # Historical layout was a fixed 150px band at y=780, so a one-line cue started at
    # 780 + (150-78)//2 = 816 and a two-line cue at 777. The band is taller now (it has
    # to be - 150px clipped two lines), so `pos` anchors its CENTRE to keep those same
    # on-screen positions.
    assert cap_y(s, 1920) == 761, cap_y(s, 1920)
    lh, bh, cy = line_height(s), band_height(s), cap_y(s, 1920)
    assert cy + (bh - lh * 1) // 2 == 816, "one-line cue moved"
    assert cy + (bh - lh * 2) // 2 == 777, "two-line cue moved"

    # preset applies
    d = resolve({"preset": "dam"})
    assert d["case"] == "upper" and d["wordsPerCue"] == 3 and d["size"] == 92, d
    # nested preset values merge, they do not replace the whole sub-dict
    t = resolve({"preset": "tinnong"})
    assert t["highlight"]["color"] == "#FF4A1C", t
    assert t["highlight"]["mode"] == "word", "unset nested keys must survive the merge"
    # explicit override beats the preset
    assert resolve({"preset": "dam", "size": 99})["size"] == 99
    # clamps
    assert resolve({"size": 9999})["size"] == 160
    assert resolve({"size": 1})["size"] == 24
    assert resolve({"wordsPerCue": 0})["wordsPerCue"] == 1
    assert resolve({"maxLines": 99})["maxLines"] == 4
    # an unknown preset falls back to classic instead of exploding mid-render
    assert resolve({"preset": "nope"})["size"] == 64
    # colours
    assert parse_color("#FFFFFF") == (255, 255, 255, 255)
    assert parse_color("#000000B3")[3] == 0xB3
    assert parse_color("bogus") == (255, 255, 255, 255), "bad colour must not crash a render"
    # band geometry grows with size and line count
    assert band_height(resolve({"size": 92, "maxLines": 2})) > band_height(resolve(None))
    # the band must never hang off the bottom of the frame
    low = resolve({"pos": 0.99})
    assert cap_y(low, 1920) + band_height(low) <= 1920

    presets = load_presets()
    assert "classic" in presets and presets["dam"]["label"] == "Đậm"
    print("caption_style.py self-check ok")

if __name__ == "__main__":
    if "--demo" in sys.argv:
        demo()
