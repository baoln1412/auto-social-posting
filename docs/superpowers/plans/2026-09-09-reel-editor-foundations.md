# Reel Editor Foundations (S0+S1+S2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the reel generator visible render progress, a prepare/render split that makes re-renders ~4× faster, and caption style presets with a live preview that cannot lie about the output.

**Architecture:** `make-reel.py` gains machine-readable `::step:` markers on stdout that `videoJobs.ts` drains and turns into per-step UI state. The one-shot pipeline splits into `--prepare` (TTS, whisper, media, waveform → a cached project JSON) and `--render` (project JSON + style → MP4), so changing a style skips TTS and whisper. Caption styling moves out of `render_cue()`'s hardcoded literals into a resolved style dict fed by a preset table that Python and TypeScript both read from one JSON file. Preview frames are rendered by the same `render_cue()` the video uses, served as a PNG.

**Tech Stack:** Python 3 (PIL, edge-tts, faster-whisper), ffmpeg, Next.js 14 App Router, TypeScript, DuckDB via `app/lib/lake.ts`.

**Spec:** `~/research-console/state/plans/auto-social-posting.yaml`, entry `reel-editor-foundations-s0-s2`

## Global Constraints

- **101 Classic must be byte-identical to today's output.** The default style reproduces the current constants exactly: `size 64`, `color #FFFFFF`, `highlight #FFDD00`, `outline #000000 7px`, `CAP_Y 780` (= `pos 0.40625` of `H=1920`), `wordsPerCue 5`. Any change to what an unstyled post renders is a regression.
- **One preset table, two readers.** `deploy/assets/caption-presets.json` is the single source of truth. Python reads it at runtime; the Next UI imports the same file. Never define a preset twice.
- **Preview uses the real renderer.** The preview PNG must come from the same `render_cue()` the MP4 uses. Do not write a second/faster preview path.
- **Fonts are gated on Vietnamese.** No font ships without passing `deploy/check-fonts.py` (diacritic torture string, zero missing glyphs).
- **Testing idiom:** Python = `demo()` with plain `assert`, run via `--demo`, offline (no ffmpeg/network). TypeScript = `npx tsc --noEmit -p .` then `npm run build`. There is no pytest or jest in this repo; do not add one.
- **Backward compatibility:** bare `make-reel.py --json in.json out.mp4` must keep working (prepare+render in sequence). `--no-intro` and `--no-layout` keep their current meaning.
- **Server restarts:** `launchctl kickstart -k gui/501/com.immigration.web`. `deploy/start-web.sh` rebuilds when sources are newer than `.next/BUILD_ID`.

---

## File Structure

**Create:**
- `deploy/caption_style.py` — preset loading, deep merge, clamping, colour parsing, band geometry. Pure; no PIL, no network.
- `deploy/assets/caption-presets.json` — the preset table (shared with the UI).
- `deploy/check-fonts.py` — Vietnamese diacritic coverage gate for bundled fonts.
- `app/api/video/preview/route.ts` — renders one caption preview PNG.

**Modify:**
- `deploy/make-reel.py` — step markers; style-driven `render_cue`; derived band height; `--prepare`/`--render`/`--preview-frame`.
- `app/lib/videoJobs.ts` — drain stdout, parse steps, expose `step`/`pct`/`steps`.
- `app/api/video/render/route.ts` — accept `style`, pass it through.
- `app/components/useVideoGen.ts` — style state, preview fetching, 1.5s poll while running.
- `app/components/VideoGenModal.tsx` — progress checklist, style panel, preview image.
- `app/lib/lake.ts` — `caption_style` column + `setGoldCaptionStyle`.
- `app/api/posts/route.ts` — map `caption_style` → `captionStyle`.
- `app/types.ts` — `captionStyle?: string` on `PostDraft`.

**Ships in three usable stages:** S0 complete after Task 6, S1 after Task 7, S2 after Task 12.

---

### Task 1: Caption style module (pure logic)

**Files:**
- Create: `deploy/caption_style.py`
- Create: `deploy/assets/caption-presets.json`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `resolve(style: dict|None) -> dict` (full flat style), `parse_color(s: str) -> tuple[int,int,int,int]`, `band_height(st: dict) -> int`, `cap_y(st: dict, frame_h: int) -> int`, `font_path(name: str) -> str`, `DEFAULTS: dict`, `load_presets() -> dict`.

- [ ] **Step 1: Write the preset table**

Create `deploy/assets/caption-presets.json`. Only fields that *differ* from `DEFAULTS` appear here — `classic` is deliberately empty because it IS the defaults.

```json
{
  "classic": { "label": "101 Classic" },
  "tinnong": {
    "label": "Tin nóng",
    "size": 76,
    "outline": { "w": 9 },
    "highlight": { "color": "#FF4A1C" }
  },
  "karaoke": {
    "label": "Karaoke",
    "highlight": { "mode": "block", "color": "#111111", "bg": "#FFDD00" }
  },
  "toigian": {
    "label": "Tối giản",
    "outline": { "w": 0 },
    "shadow": { "dy": 4 },
    "highlight": { "mode": "none" }
  },
  "dam": {
    "label": "Đậm",
    "size": 92,
    "case": "upper",
    "wordsPerCue": 3
  }
}
```

- [ ] **Step 2: Write the failing self-check**

Create `deploy/caption_style.py` containing ONLY the docstring and this `demo()` plus the `__main__` guard, so it fails on missing functions first.

```python
"""Caption style resolution: preset + per-post overrides -> one flat style dict.

Pure logic - no PIL, no network - so it self-checks offline with --demo.
The preset table lives in deploy/assets/caption-presets.json and is read by the
Next UI too; one file, so the two sides cannot drift apart.
"""
import json, os, sys

def demo():
    s = resolve(None)
    assert s["size"] == 64 and s["color"] == "#FFFFFF", s
    assert s["outline"] == {"color": "#000000", "w": 7}, s
    assert s["highlight"]["color"] == "#FFDD00", s
    assert s["wordsPerCue"] == 5, s
    # The default MUST reproduce today's CAP_Y=780 on a 1920-tall frame, or every
    # existing reel moves. This is the regression guard for "101 Classic".
    assert cap_y(s, 1920) == 780, cap_y(s, 1920)

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
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `python3 deploy/caption_style.py --demo`
Expected: `NameError: name 'resolve' is not defined`

- [ ] **Step 4: Implement the module**

Insert above `demo()`:

```python
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
    "pos": 780 / 1920,                                      # fraction of frame height
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
    """Top edge of the band, kept fully inside the frame."""
    return max(0, min(int(st["pos"] * frame_h), frame_h - band_height(st)))

def font_path(name):
    p = os.path.join(FONT_DIR, f"{name}.ttf")
    return p if os.path.exists(p) else os.path.join(FONT_DIR, "BeVietnamPro-Bold.ttf")
```

- [ ] **Step 5: Run the self-check**

Run: `python3 deploy/caption_style.py --demo`
Expected: `caption_style.py self-check ok`

- [ ] **Step 6: Commit**

```bash
git add deploy/caption_style.py deploy/assets/caption-presets.json
git commit -m "feat(reel): caption style presets + resolution, defaulting to today's look"
```

---

### Task 2: Vietnamese font gate

**Files:**
- Create: `deploy/check-fonts.py`
- Modify: `deploy/assets/caption-presets.json` (only if a candidate font fails and a preset must fall back)

**Interfaces:**
- Consumes: `caption_style.font_path`, `caption_style.load_presets`.
- Produces: `deploy/check-fonts.py` as a gate; any font present in `public/fonts/*.ttf` is expected to pass.

- [ ] **Step 1: Write the gate**

Create `deploy/check-fonts.py`. Tofu detection without fontTools: render a glyph and compare its bitmap to that of an unassigned codepoint — a font renders the same `.notdef` box for both when the glyph is missing.

```python
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
UNASSIGNED = ""        # private use area: every font draws .notdef here

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
```

- [ ] **Step 2: Run it against the font already shipping**

Run: `cd deploy && python3 check-fonts.py BeVietnamPro-Bold`
Expected: `ok BeVietnamPro-Bold` then `all 1 font(s) set Vietnamese cleanly`. If this fails, the detector is wrong — fix the detector before trusting it on new fonts.

- [ ] **Step 3: Prove the gate actually catches a bad font**

A gate that never fails is not a gate. Verify against a face known to lack Vietnamese:

Run:
```bash
cd deploy && python3 -c "
import caption_style, check_fonts
from PIL import ImageFont
# Symbol-only system face: must NOT pass a Vietnamese check.
import os; p='/System/Library/Fonts/Apple Symbols.ttf'
print('present:', os.path.exists(p))
"
```
If that file exists, temporarily copy it into `public/fonts/TestBad.ttf`, run `python3 check-fonts.py TestBad`, confirm it reports FAIL, then delete it. If it does not exist on this machine, skip — do not weaken the detector to make a test pass.

- [ ] **Step 4: Commit**

```bash
git add deploy/check-fonts.py
git commit -m "test(reel): gate bundled fonts on Vietnamese diacritic coverage"
```

> **Note on adding fonts:** this task ships the gate, not new fonts. `classic` and every preset above use `BeVietnamPro-Bold`, which already passes. Add faces later by dropping the `.ttf` into `public/fonts/`, running `python3 deploy/check-fonts.py`, and only then referencing the name from a preset.

---

### Task 3: `render_cue` takes a style

**Files:**
- Modify: `deploy/make-reel.py:166-183` (`render_cue`), `deploy/make-reel.py:117` (`align_cues` signature), `deploy/make-reel.py:459` (`demo`)

**Interfaces:**
- Consumes: `caption_style.resolve`, `parse_color`, `line_height`, `band_height`, `font_path`.
- Produces: `render_cue(words, active, st) -> PIL.Image` (RGBA, `W × band_height(st)`); `align_cues(text, ww, dur, size=5)` unchanged in signature but callers now pass `size=st["wordsPerCue"]`.

- [ ] **Step 1: Write the failing assertions**

Add to `demo()` in `deploy/make-reel.py`, immediately before `print("make-reel.py self-check ok")`:

```python
    # --- caption style ---------------------------------------------------------
    st = caption_style.resolve(None)
    words = [("MỘT", 0.0, 0.3), ("HAI", 0.3, 0.6)]
    img = render_cue(words, 0, st)
    assert img.mode == "RGBA" and img.size == (W, caption_style.band_height(st)), img.size

    def _has(im, rgb, tol=12):
        return any(abs(p[0]-rgb[0]) <= tol and abs(p[1]-rgb[1]) <= tol and abs(p[2]-rgb[2]) <= tol
                   for p in im.getdata() if p[3] > 200)

    # Classic: the spoken word is brand yellow, the rest white, outlined black.
    assert _has(img, (255, 221, 0)), "active word should be #FFDD00 under the classic preset"
    assert _has(img, (255, 255, 255)), "inactive words should be white"
    assert _has(img, (0, 0, 0)), "outline should be black"

    # highlight mode 'none' means no yellow anywhere
    plain = render_cue(words, 0, caption_style.resolve({"highlight": {"mode": "none"}}))
    assert not _has(plain, (255, 221, 0)), "mode 'none' must not paint a highlight colour"

    # casing is applied by the renderer, not by the caller
    up = render_cue([("mot", 0.0, 0.3)], 0, caption_style.resolve({"case": "upper"}))
    lo = render_cue([("mot", 0.0, 0.3)], 0, caption_style.resolve({"case": "none"}))
    assert up.tobytes() != lo.tobytes(), "case: upper must change the rendering"

    # a taller band is produced for a bigger font, so nothing clips
    big = caption_style.resolve({"size": 92})
    assert render_cue(words, 0, big).size[1] > img.size[1]
```

- [ ] **Step 2: Run to confirm it fails**

Run: `python3 deploy/make-reel.py --demo`
Expected: `TypeError: render_cue() takes from 2 to 4 positional arguments but ...` or `NameError: caption_style`

- [ ] **Step 3: Import the module and rewrite `render_cue`**

Add to the import block at `deploy/make-reel.py:36`:

```python
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import caption_style
```

Replace `render_cue` (lines 166-183) entirely:

```python
def render_cue(words, active, st=None):
    """One caption frame, styled. The whole cue is drawn in the base colour and the word
    being spoken switches to the highlight colour (or gets a filled block behind it).
    Band height is derived from the style so a large font cannot clip."""
    st = st or caption_style.resolve(None)
    cap_h = caption_style.band_height(st)
    img = Image.new("RGBA", (W, cap_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(caption_style.font_path(st["font"]), st["size"])

    base = caption_style.parse_color(st["color"])
    hl = st["highlight"]
    hl_col = caption_style.parse_color(hl["color"])
    hl_bg = caption_style.parse_color(hl["bg"]) if hl.get("bg") else None
    stroke = int(st["outline"]["w"])
    stroke_col = caption_style.parse_color(st["outline"]["color"])
    sh = st["shadow"]
    sh_col = caption_style.parse_color(sh["color"])

    text = [w.upper() if st["case"] == "upper" else w for w, _, _ in words]
    lines, sp = layout_words(d, text, font, W - 60)
    lines = lines[:st["maxLines"]]
    lh = caption_style.line_height(st)
    y = (cap_h - lh * len(lines)) // 2
    i = 0
    for line, lw in lines:
        x = (W - lw) / 2
        for w, wl in line:
            is_active = (i == active)
            if is_active and hl["mode"] == "block" and hl_bg:
                pad = max(4, st["size"] // 8)
                d.rounded_rectangle([x - pad, y - pad // 2, x + wl + pad, y + lh - pad // 2],
                                    radius=pad, fill=hl_bg)
            fill = hl_col if (is_active and hl["mode"] in ("word", "block")) else base
            if sh["dy"] or sh["dx"]:
                d.text((x + sh["dx"], y + sh["dy"]), w, font=font, fill=sh_col)
            d.text((x, y), w, font=font, fill=fill,
                   stroke_width=stroke, stroke_fill=stroke_col if stroke else None)
            x += wl + sp
            i += 1
        y += lh
    return img
```

- [ ] **Step 4: Run the self-check**

Run: `python3 deploy/make-reel.py --demo`
Expected: `make-reel.py self-check ok`

- [ ] **Step 5: Commit**

```bash
git add deploy/make-reel.py
git commit -m "feat(reel): render_cue draws from a resolved style instead of literals"
```

---

### Task 4: Thread style through the caption track and the filter graph

**Files:**
- Modify: `deploy/make-reel.py:198-222` (`render_caption_track`), `deploy/make-reel.py:317` (`build_content`), `deploy/make-reel.py:47` (drop the fixed `CAP_H`)

**Interfaces:**
- Consumes: Task 3's `render_cue(words, active, st)`.
- Produces: `render_caption_track(path, cues, dur, st, fps=30) -> bool`; `build_content(tmp, post, content, validate_to=None, include_layout=True, st=None)`.

- [ ] **Step 1: Make the band size follow the style**

In `render_caption_track`, replace the signature and the two places `CAP_H` is used:

```python
def render_caption_track(path, cues, dur, st, fps=30):
    """Pre-composite the whole caption band into ONE alpha clip, so the filter graph carries a
    single overlay instead of one per word. Measured on a 15s clip: 30 overlays 2.9s vs 150
    overlays 39.7s — overlay count scales superlinearly, so per-word highlighting cannot live in
    the filter graph. Frames are cached per (cue, word), so PIL draws once per word, not per frame.
    The band's height comes from the style: a 92px preset needs a taller strip than a 64px one,
    and the rawvideo size below must agree with what render_cue actually produces."""
    cap_h = caption_style.band_height(st)
    n = max(1, int(round(dur * fps)))
    blank = Image.new("RGBA", (W, cap_h), (0, 0, 0, 0)).tobytes()
    cache = {}
    p = subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba",
         "-s", f"{W}x{cap_h}", "-r", str(fps), "-i", "-", "-c:v", "qtrle", path],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    for f in range(n):
        key = active_word(cues, f / fps)
        if key is None:
            p.stdin.write(blank)
            continue
        if key not in cache:
            cache[key] = render_cue(cues[key[0]][2], key[1], st).tobytes()
        p.stdin.write(cache[key])
    p.stdin.close()
    if p.wait() != 0:
        print(p.stderr.read().decode()[-800:])
        return False
    return True
```

- [ ] **Step 2: Update `CAP_Y`/`CAP_H` usage at the call sites**

At `deploy/make-reel.py:47`, replace the fixed pair with only what still makes sense:

```python
CAP_Y_DEFAULT = 780                   # kept for reference; real value comes from the style
```

In `build_content`, resolve the style once near the top (right after the narration is settled) and use it for cues, the caption track and the overlay Y:

```python
    st = caption_style.resolve(st if isinstance(st, dict) else None)
    cues = align_cues(nar, whisper_words(mp3), dur, size=st["wordsPerCue"])
```

and where the caption track is built:

```python
    caps_mov = os.path.join(tmp, "caps.mov")
    if not render_caption_track(caps_mov, cues, dur, st):
        return None
```

and in the filter graph, replace the hardcoded `CAP_Y`:

```python
    parts.append(f"[bg][{cap_idx}:v]overlay=0:{caption_style.cap_y(st, H)}[cap]")
```

Change the signature to accept it:

```python
def build_content(tmp, post, content, validate_to=None, include_layout=True, st=None):
```

- [ ] **Step 3: Verify nothing else references the removed constant**

Run: `grep -n "CAP_H\|CAP_Y" deploy/make-reel.py`
Expected: only `CAP_Y_DEFAULT` on line 47 and `caption_style.cap_y(...)` in the filter graph. Any other hit is a missed call site — fix it before continuing.

- [ ] **Step 4: Run the self-check**

Run: `python3 deploy/make-reel.py --demo`
Expected: `make-reel.py self-check ok`

- [ ] **Step 5: Render a real reel and confirm it is unchanged**

Run (uses the default style, so output must match what this post rendered before):
```bash
curl -s http://127.0.0.1:3000/api/pages | python3 -c "import json,sys;print(json.load(sys.stdin)['pages'][0]['id'])"
# then, with that id:
python3 deploy/make-reel.py <marketId> 0 /tmp/regress-after.mp4 --no-intro
```
Expected: completes, and the captions sit in the same place, same size, same colours as before this task. Eyeball one frame:
```bash
ffmpeg -y -v error -ss 3 -i /tmp/regress-after.mp4 -frames:v 1 /tmp/regress-after.png
```
Open `/tmp/regress-after.png` and confirm white text with a yellow spoken word, low third of the frame.

- [ ] **Step 6: Commit**

```bash
git add deploy/make-reel.py
git commit -m "feat(reel): caption band geometry follows the style through to the filter graph"
```

---

### Task 5: Step markers on stdout

**Files:**
- Modify: `deploy/make-reel.py` — new `step()` helper near the top; calls inside `build_content`, `render_caption_track`, `splice_intro`; `demo()` gains a format assertion.

**Interfaces:**
- Consumes: nothing.
- Produces: `step(name: str, state: str = "start") -> None`, printing `::step:<name>:<state>` and flushing. Names, in order: `tts`, `align`, `media`, `captions`, `compose`, `intro`.

- [ ] **Step 1: Write the failing assertion**

Add to `demo()` in `deploy/make-reel.py`:

```python
    # --- step markers ----------------------------------------------------------
    assert fmt_step("media", "2/5") == "::step:media:2/5"
    assert fmt_step("tts") == "::step:tts:start"
    assert fmt_step("intro", "skipped") == "::step:intro:skipped"
```

- [ ] **Step 2: Run to confirm it fails**

Run: `python3 deploy/make-reel.py --demo`
Expected: `NameError: name 'fmt_step' is not defined`

- [ ] **Step 3: Implement the emitter**

Add after the constants block (around line 51):

```python
# Progress markers. The web UI reads these off stdout (app/lib/videoJobs.ts) to show which
# stage is running; anything else printed here is human-facing noise and is ignored by it.
# Keep the format exact - it is a contract with the parser on the other side.
def fmt_step(name, state="start"):
    return f"::step:{name}:{state}"

def step(name, state="start"):
    print(fmt_step(name, state), flush=True)
```

`flush=True` matters: stdout is a pipe here, not a terminal, so without it the markers sit in a block buffer and the UI learns nothing until the process exits.

- [ ] **Step 4: Emit the markers**

In `build_content`, wrap each stage:

```python
    step("tts")
    dur, hook_end = asyncio.run(tts(nar, mp3))
    if dur <= 0:
        return None
    step("tts", "done")

    step("align")
    cues = align_cues(nar, whisper_words(mp3), dur, size=st["wordsPerCue"])
    step("align", "done")
```

Around the media loop:

```python
    step("media")
    bg_items = []
    media = get_media(post)
    for i, m in enumerate(media):
        step("media", f"{i + 1}/{len(media)}")
        ...
    step("media", "done")
```

Around the caption track and the ffmpeg composite:

```python
    step("captions")
    caps_mov = os.path.join(tmp, "caps.mov")
    if not render_caption_track(caps_mov, cues, dur, st):
        return None
    step("captions", "done")
```

```python
    step("compose")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-1800:]); return None
    step("compose", "done")
```

Inside `render_caption_track`'s frame loop, report a percentage — this is the slowest stage and a bare spinner there reads as a hang:

```python
    last_pct = -5
    for f in range(n):
        pct = int(f * 100 / n)
        if pct >= last_pct + 5:
            step("captions", f"{pct}%")
            last_pct = pct
```

In `main`, around the intro:

```python
    if no_intro:
        step("intro", "skipped")
        print("  intro skipped (--no-intro)…")
        shutil.move(content, out)
    else:
        step("intro")
        print("  splicing intro after hook…")
        if not splice_intro(content, dur, hook_end, out):
            print("splice failed"); sys.exit(1)
        step("intro", "done")
```

- [ ] **Step 5: Run the self-check**

Run: `python3 deploy/make-reel.py --demo`
Expected: `make-reel.py self-check ok`

- [ ] **Step 6: See the markers on a real run**

Run: `python3 deploy/make-reel.py <marketId> 0 /tmp/steps.mp4 --no-intro 2>&1 | grep '^::step:'`
Expected: `::step:tts:start`, `::step:tts:done`, `::step:align:start`, …, `::step:captions:5%` … `::step:compose:done`, in that order.

- [ ] **Step 7: Commit**

```bash
git add deploy/make-reel.py
git commit -m "feat(reel): emit machine-readable stage markers on stdout"
```

---

### Task 6: Node reads the markers, UI shows the checklist *(completes S0)*

**Files:**
- Modify: `app/lib/videoJobs.ts:19-24` (`VideoJob`), `:56-78` (spawn + handlers)
- Modify: `app/api/video/render/route.ts:19-24` (GET)
- Modify: `app/components/useVideoGen.ts:31-36` (job state), `:128-146` (poll)
- Modify: `app/components/VideoGenModal.tsx:245-252` (running indicator)

**Interfaces:**
- Consumes: Task 5's `::step:<name>:<state>` lines.
- Produces: `VideoJob` gains `step?: string`, `pct?: number`, `done: string[]`; the GET response carries the same; `useVideoGen` exposes `jobStep`, `jobPct`, `jobDone`.

- [ ] **Step 1: Extend the job shape and drain stdout**

In `app/lib/videoJobs.ts`, replace the `VideoJob` interface:

```ts
export interface VideoJob {
  id: string;
  status: 'running' | 'done' | 'error';
  file?: string;
  error?: string;
  /** Stage currently running, e.g. 'captions'. Set from make-reel.py's ::step: markers. */
  step?: string;
  /** 0-100 within the current stage; only 'captions' reports one. */
  pct?: number;
  /** Stages already finished, in completion order. */
  done?: string[];
}

export const STEP_LABELS: Record<string, string> = {
  tts: 'Giọng đọc',
  align: 'Căn chữ',
  media: 'Tải ảnh/video',
  captions: 'Dựng phụ đề',
  compose: 'Ghép video',
  intro: 'Chèn intro',
};
export const STEP_ORDER = ['tts', 'align', 'media', 'captions', 'compose', 'intro'];
```

Then, in `startRenderJob`, replace the stderr-only handling. Note this also fixes a latent hang: an unread stdout pipe blocks the child once its 64KB buffer fills.

```ts
  const child = spawn(PYTHON, args, { cwd: ROOT, env });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  // stdout carries the ::step: markers AND must be drained regardless - an unread pipe
  // stalls the child at 64KB, which would look exactly like a hung render.
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const m = /^::step:([a-z]+):(.+)$/.exec(line.trim());
      if (!m) continue;
      const [, name, state] = m;
      const job = jobs.get(id);
      if (!job) continue;
      const done = job.done ?? [];
      if (state === 'done' || state === 'skipped') {
        jobs.set(id, { ...job, step: name, pct: undefined, done: done.includes(name) ? done : [...done, name] });
      } else {
        const pct = /^(\d+)%$/.exec(state)?.[1];
        jobs.set(id, { ...job, step: name, pct: pct ? Number(pct) : undefined, done });
      }
    }
  });
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Surface it through the API and the hook**

`app/api/video/render/route.ts` GET already returns the whole job object, so it carries the new fields with no change — confirm by reading it; if it destructures specific fields, return the job as-is instead.

In `app/components/useVideoGen.ts`, add state and read it in the poll:

```ts
  const [jobStep, setJobStep] = useState<string | null>(null);
  const [jobPct, setJobPct] = useState<number | null>(null);
  const [jobDone, setJobDone] = useState<string[]>([]);
```

Inside the polling `setInterval` callback, before the status checks:

```ts
        setJobStep(data.step ?? null);
        setJobPct(typeof data.pct === 'number' ? data.pct : null);
        setJobDone(Array.isArray(data.done) ? data.done : []);
```

Change the interval from `4000` to `1500` — it is an in-memory map read, so the extra polls cost nothing and 4s makes the checklist feel dead.

Add all three to the hook's return object.

- [ ] **Step 4: Render the checklist**

In `app/components/VideoGenModal.tsx`, replace the running indicator block:

```tsx
                {vg.jobStatus === 'running' && (
                  <div className="rounded-md bg-warning/10 border border-warning/25 px-3 py-2.5 space-y-1.5">
                    {STEP_ORDER.map((s) => {
                      const done = vg.jobDone.includes(s);
                      const active = vg.jobStep === s && !done;
                      return (
                        <div key={s} className={`flex items-center gap-2 text-xs ${
                          done ? 'text-success' : active ? 'text-foreground font-semibold' : 'text-muted-foreground/60'
                        }`}>
                          <span className="w-4 shrink-0">{done ? '✓' : active ? '●' : '○'}</span>
                          <span>{STEP_LABELS[s]}</span>
                          {active && vg.jobPct !== null && (
                            <span className="font-mono ml-auto">{vg.jobPct}%</span>
                          )}
                        </div>
                      );
                    })}
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Render đang chạy ngầm — bạn có thể đóng khung này.
                    </p>
                  </div>
                )}
```

Import the labels at the top of the file:

```tsx
import { STEP_LABELS, STEP_ORDER } from '@/app/lib/videoJobs';
```

Also make a failure say *where* it failed — the job keeps its last `step` when it errors, and "failed at Dựng phụ đề" is the whole usability win here. Replace the existing error line:

```tsx
                {vg.jobStatus === 'error' && vg.jobError && (
                  <div className="text-xs text-destructive space-y-1">
                    {vg.jobStep && (
                      <p className="font-semibold">
                        Lỗi ở bước: {STEP_LABELS[vg.jobStep] ?? vg.jobStep}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap">{vg.jobError}</p>
                  </div>
                )}
```

This requires `videoJobs.ts` to preserve `step` on failure — confirm the error branch spreads the existing job rather than replacing it wholesale:

```ts
    } else {
      const prev = jobs.get(id);
      jobs.set(id, { ...prev, id, status: 'error',
                     error: stderr.trim().slice(-500) || `exit ${code}` });
    }
```

> If importing from `videoJobs.ts` pulls server-only modules (`child_process`, `fs`) into the client bundle, move `STEP_LABELS`/`STEP_ORDER` into a new `app/lib/videoSteps.ts` with no imports and have both sides read that. `npm run build` will tell you.

- [ ] **Step 5: Build and verify end to end**

Run: `npx tsc --noEmit -p . && npm run build && launchctl kickstart -k gui/501/com.immigration.web`
Then start a render from the UI and poll:
```bash
curl -s "http://127.0.0.1:3000/api/video/render?jobId=<id>" | python3 -m json.tool
```
Expected: `step` advances `tts → align → media → captions → compose`, `done` grows, `pct` appears during `captions`.

- [ ] **Step 6: Screenshot the drawer mid-render**

Confirm visually that the checklist ticks over rather than sitting on one line. **S0 is complete at this point.**

- [ ] **Step 7: Commit**

```bash
git add app/lib/videoJobs.ts app/api/video/render/route.ts app/components/useVideoGen.ts app/components/VideoGenModal.tsx
git commit -m "feat(video): show per-stage render progress in the drawer"
```

---

### Task 7: prepare/render split *(completes S1)*

**Files:**
- Modify: `deploy/make-reel.py` — `build_content` split into `prepare()` + `render()`; `main()` gains `--prepare`/`--render`; `demo()` gains cache-key and round-trip assertions.

**Interfaces:**
- Consumes: everything above.
- Produces: `project_key(post) -> str`, `prepare(post, work_dir) -> dict` (writes `project.json`), `render_from_project(proj, work_dir, out, st, include_layout=True) -> tuple[float,float] | None`.

- [ ] **Step 1: Write the failing assertions**

Add to `demo()`:

```python
    # --- project cache key -----------------------------------------------------
    a = {"narration": "xin chào", "media": [{"url": "u1", "kind": "image"}]}
    b = {"narration": "xin chào", "media": [{"url": "u1", "kind": "image"}]}
    c = {"narration": "khác",     "media": [{"url": "u1", "kind": "image"}]}
    d = {"narration": "xin chào", "media": [{"url": "u2", "kind": "image"}]}
    assert project_key(a) == project_key(b), "same inputs must reuse the cached project"
    assert project_key(a) != project_key(c), "a script change must invalidate the cache"
    assert project_key(a) != project_key(d), "a media change must invalidate the cache"
    # style is deliberately NOT part of the key - restyling must reuse TTS and whisper
    assert project_key({**a, "style": {"preset": "dam"}}) == project_key(a)
```

- [ ] **Step 2: Run to confirm it fails**

Run: `python3 deploy/make-reel.py --demo`
Expected: `NameError: name 'project_key' is not defined`

- [ ] **Step 3: Implement the key and the split**

Add near `get_media`:

```python
import hashlib

def project_key(post):
    """Identity of the EXPENSIVE work (voice + alignment + fetched media), so a project
    can be reused. Style is excluded on purpose: restyling is exactly the case that must
    not pay for TTS and whisper again."""
    parts = [(post.get("narration") or "").strip()]
    for m in (post.get("media") or []):
        parts.append(f"{m.get('kind')}:{m.get('url')}")
    if not post.get("media"):
        parts.append(str((post.get("article") or {}).get("imageUrl") or ""))
    return hashlib.sha1(" ".join(parts).encode("utf-8")).hexdigest()[:16]
```

Split `build_content`: everything up to and including the media fetch becomes `prepare`, writing `project.json` into `work_dir`; everything after becomes `render_from_project`. Keep `build_content` as a thin wrapper so existing callers do not change:

```python
def prepare(post, work_dir):
    """Expensive, style-independent half: voice, word timings, media on disk, waveform.
    Returns the project dict and writes it to work_dir/project.json."""
    os.makedirs(work_dir, exist_ok=True)
    proj_path = os.path.join(work_dir, "project.json")
    if os.path.exists(proj_path):
        with open(proj_path, encoding="utf-8") as f:
            proj = json.load(f)
        if proj.get("key") == project_key(post):
            print("  project cache hit — skipping tts + alignment")
            for name in ("tts", "align", "media"):
                step(name, "done")
            return proj

    mp3 = os.path.join(work_dir, "v.mp3")
    if post.get("narration"):
        nar = clean(" ".join(ln.strip() for ln in post["narration"].splitlines() if ln.strip()))[:4000]
    else:
        nar = narration(post)
    step("tts")
    dur, hook_end = asyncio.run(tts(nar, mp3))
    if dur <= 0:
        return None
    step("tts", "done")

    step("align")
    ww = whisper_words(mp3)
    step("align", "done")

    step("media")
    media = get_media(post)
    items = []
    for i, m in enumerate(media):
        step("media", f"{i + 1}/{len(media)}")
        is_video = m["kind"] == "video"
        p = os.path.join(work_dir, f"bg{i}.{'mp4' if is_video else 'jpg'}")
        if (fetch_video(m["url"], p) if is_video else fetch_image(m["url"], p)):
            items.append({"path": os.path.basename(p), "kind": m["kind"]})
    step("media", "done")

    proj = {"key": project_key(post), "narration": nar, "audio": "v.mp3",
            "dur": dur, "hookEnd": hook_end,
            "words": [[w, s, e] for s, e, w in ww],
            "media": items,
            "peaks": audio_peaks(mp3),
            "emojiTitle": post.get("emojiTitle", "")}
    with open(proj_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, ensure_ascii=False)
    return proj
```

And the waveform helper it calls, next to `video_duration`:

```python
def audio_peaks(mp3, buckets=400):
    """Coarse waveform envelope, 0..1 per bucket. Nothing in S0-S2 draws this - the
    timeline (S3) does. It is computed HERE anyway because the audio only exists during
    prepare: adding it later would mean re-running TTS on every project just to get a
    picture of a waveform. ffmpeg is already a hard dependency, so this costs one extra
    decode of a file that is at most a minute long."""
    try:
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", mp3, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
            capture_output=True).stdout
        a = array.array("h")
        a.frombytes(raw[:len(raw) - len(raw) % 2])
        if not a:
            return []
        n = max(1, len(a) // buckets)
        return [min(1.0, max(abs(v) for v in a[i:i + n]) / 32768.0)
                for i in range(0, len(a), n)][:buckets]
    except Exception:
        return []                      # a missing waveform must never fail a render
```

Add `array` to the import line at `deploy/make-reel.py:36`.

Now `render_from_project`. This is a **move, not a rewrite** — take the body of today's `build_content` from the `bg_items` loop onward (currently `deploy/make-reel.py:326-423`: segment durations, `slideshow_risk`, title PNG, caption track, ffmpeg inputs, filter graph, the `subprocess.run`) and paste it in unchanged except for the four substitutions listed below.

```python
def render_from_project(proj, work_dir, out, st, include_layout=True):
    """Cheap, style-dependent half. Everything expensive already happened in prepare();
    this reads its output and composites. Returns (dur, hook_end) or None."""
    st = caption_style.resolve(st)
    dur, hook_end = proj["dur"], proj["hookEnd"]
    mp3 = os.path.join(work_dir, proj["audio"])
    # Cues are rebuilt here, not cached: wordsPerCue is a STYLE knob, so the chunking has
    # to be redone whenever the style changes - while the word timings underneath it, the
    # part that cost a whisper pass, are reused as-is.
    ww = [(s, e, w) for w, s, e in proj["words"]]
    cues = align_cues(proj["narration"], ww, dur, size=st["wordsPerCue"])
    bg_items = [{"path": os.path.join(work_dir, m["path"]), "kind": m["kind"]}
                for m in proj["media"]]
    post = {"emojiTitle": proj.get("emojiTitle", "")}     # only the title overlay needs it
    # <<< body of the old build_content from `n_bg = max(1, len(bg_items))` onward >>>
```

The four substitutions inside that pasted body:

| Old | New | Why |
|---|---|---|
| `mp3 = os.path.join(tmp, "v.mp3")` | delete — `mp3` is a parameter now | audio comes from the project |
| `render_caption_track(caps_mov, cues, dur)` | `render_caption_track(caps_mov, cues, dur, st)` | Task 4 |
| `overlay=0:{CAP_Y}` | `overlay=0:{caption_style.cap_y(st, H)}` | Task 4 |
| `content` (the output path) | `out` | parameter renamed |

Then `build_content` becomes the thin wrapper that keeps every existing caller working:

```python
def build_content(tmp, post, content, validate_to=None, include_layout=True, st=None):
    """Back-compat shim: prepare + render in one call, which is what `--json in out` and
    every current caller expect."""
    proj = prepare(post, tmp)
    if not proj:
        return None
    if validate_to:
        shutil.copy(os.path.join(tmp, proj["audio"]), validate_to)
        print(f"\n  VALIDATE — narration ({len(proj['narration'])} chars):\n{proj['narration']}"
              f"\n\n  audio: {validate_to}\n  Looks right? Re-run without --validate to render.")
        return None
    return render_from_project(proj, tmp, content, st, include_layout)
```

> Note the `--validate` early-exit moved into the wrapper: it belongs after prepare (the voice exists) and before render (the expensive compositing), which is exactly where it sat before.

- [ ] **Step 4: Wire up the CLI**

In `main()`:

```python
    sys.argv[:], only_prepare = take_flag(sys.argv, "--prepare")
    sys.argv[:], only_render = take_flag(sys.argv, "--render")
```

Work dir: `data/reels/work/<project_key>/`, so two posts with identical inputs share one prepare. `--prepare` runs `prepare()` and exits; `--render` requires an existing project and skips straight to rendering; neither flag runs both, as today.

- [ ] **Step 5: Run the self-check**

Run: `python3 deploy/make-reel.py --demo`
Expected: `make-reel.py self-check ok`

- [ ] **Step 6: Prove the cache actually saves the expensive work**

```bash
time python3 deploy/make-reel.py --json /tmp/p.json /tmp/r1.mp4 --no-intro
time python3 deploy/make-reel.py --json /tmp/p.json /tmp/r2.mp4 --no-intro
```
Expected: the second run prints `project cache hit — skipping tts + alignment` and is materially faster. Confirm no TTS happened: the second run's output must contain no `::step:tts:start`.

- [ ] **Step 7: Commit**

```bash
git add deploy/make-reel.py
git commit -m "feat(reel): split prepare/render so restyling skips tts + whisper"
```

---

### Task 8: `--preview-frame`

**Files:**
- Modify: `deploy/make-reel.py` — `preview_frame()` + `--preview-frame` flag; `demo()` assertion.

**Interfaces:**
- Consumes: `render_cue`, `caption_style`.
- Produces: `preview_frame(text, st, plate_path, out_png) -> None`.

- [ ] **Step 1: Write the failing assertion**

```python
    # --- preview frame ---------------------------------------------------------
    import tempfile as _tf
    with _tf.TemporaryDirectory() as td:
        p = os.path.join(td, "prev.png")
        preview_frame("MỘT HAI BA", caption_style.resolve(None), None, p)
        im = Image.open(p)
        assert im.size == (W, H), im.size
        assert im.mode == "RGB", im.mode
```

- [ ] **Step 2: Run to confirm it fails**

Run: `python3 deploy/make-reel.py --demo` → `NameError: name 'preview_frame' is not defined`

- [ ] **Step 3: Implement**

```python
def preview_frame(text, st, plate_path, out_png):
    """One full-frame PNG showing the caption band as the video will draw it. Uses the
    SAME render_cue as the real render - if this ever forks into its own drawing code,
    the preview starts lying, which is the entire reason it is server-rendered."""
    plate = Image.new("RGB", (W, H), (18, 18, 18))
    if plate_path and os.path.exists(plate_path):
        try:
            src = Image.open(plate_path).convert("RGB")
            scale = max(W / src.width, H / src.height)
            src = src.resize((int(src.width * scale), int(src.height * scale)), Image.LANCZOS)
            plate.paste(src, ((W - src.width) // 2, (H - src.height) // 2))
        except Exception:
            pass                       # unreadable plate -> keep the neutral one
    words = [(w, 0.0, 0.0) for w in (text or "").split()][:st["wordsPerCue"]] or [("PREVIEW", 0, 0)]
    band = render_cue(words, 0, st)
    plate.paste(band, (0, caption_style.cap_y(st, H)), band)
    plate.save(out_png)
```

In `main()`, handle the flag before anything expensive:

```python
    if sys.argv[1] == "--preview-frame":
        cfg = json.load(open(sys.argv[2]))
        preview_frame(cfg.get("text", ""), caption_style.resolve(cfg.get("style")),
                      cfg.get("plate"), sys.argv[3])
        return
```

- [ ] **Step 4: Run the self-check**

Run: `python3 deploy/make-reel.py --demo` → `make-reel.py self-check ok`

- [ ] **Step 5: Eyeball one**

```bash
echo '{"text":"MỸ SIẾT CHẶT VISA H-1B TỪ THÁNG SAU","style":{"preset":"dam"}}' > /tmp/prev.json
python3 deploy/make-reel.py --preview-frame /tmp/prev.json /tmp/prev.png && open /tmp/prev.png
```
Expected: 1080×1920, dark plate, three all-caps words, first one highlighted.

- [ ] **Step 6: Commit**

```bash
git add deploy/make-reel.py
git commit -m "feat(reel): --preview-frame renders one styled caption frame"
```

---

### Task 9: Preview API route

**Files:**
- Create: `app/api/video/preview/route.ts`

**Interfaces:**
- Consumes: Task 8's `--preview-frame`.
- Produces: `POST /api/video/preview` with `{ text, style, plateUrl? }` → `image/png`.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROOT = process.cwd();
const PYTHON = '/opt/homebrew/bin/python3';
const SCRIPT = join(ROOT, 'deploy', 'make-reel.py');

export async function POST(req: NextRequest) {
  const { text, style, plate } = await req.json();
  const dir = mkdtempSync(join(tmpdir(), 'reel-prev-'));
  const cfg = join(dir, 'cfg.json');
  const png = join(dir, 'out.png');
  writeFileSync(cfg, JSON.stringify({ text: text ?? '', style: style ?? {}, plate: plate ?? null }));

  const code = await new Promise<number>((resolve) => {
    const child = spawn(PYTHON, [SCRIPT, '--preview-frame', cfg, png], {
      cwd: ROOT,
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
    });
    child.on('close', (c) => resolve(c ?? 1));
    child.on('error', () => resolve(1));
  });

  if (code !== 0) {
    return NextResponse.json({ error: 'preview failed' }, { status: 500 });
  }
  const buf = readFileSync(png);
  try { unlinkSync(cfg); unlinkSync(png); } catch { /* temp dir, best effort */ }
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  });
}
```

- [ ] **Step 2: Build and hit it**

```bash
npx tsc --noEmit -p . && npm run build && launchctl kickstart -k gui/501/com.immigration.web && sleep 3
curl -s -X POST http://127.0.0.1:3000/api/video/preview -H 'Content-Type: application/json' \
  -d '{"text":"MỸ SIẾT CHẶT VISA","style":{"preset":"tinnong"}}' -o /tmp/api-prev.png
file /tmp/api-prev.png
```
Expected: `PNG image data, 1080 x 1920`.

- [ ] **Step 3: Commit**

```bash
git add app/api/video/preview/route.ts
git commit -m "feat(video): preview endpoint rendering one styled caption frame"
```

---

### Task 10: Persist the style per post

**Files:**
- Modify: `app/lib/lake.ts` (schema migration + `setGoldCaptionStyle`), `app/api/posts/route.ts` (GET mapping + PATCH branch), `app/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `setGoldCaptionStyle(id: string, style: string): Promise<boolean>`; `PostDraft.captionStyle?: string` (JSON string); `PATCH /api/posts { id, captionStyle }`.

- [ ] **Step 1: Add the column**

In `app/lib/lake.ts`, beside the other `ALTER TABLE gold_content` migrations:

```sql
    -- Caption style for the reel renderer, stored as a JSON string (preset + overrides).
    -- Per post rather than per market: two posts in one market legitimately want
    -- different treatments (a quiet policy explainer vs a breaking-news clip).
    ALTER TABLE gold_content ADD COLUMN IF NOT EXISTS caption_style TEXT;
```

Then, next to `setGoldVideo`:

```ts
/** Persist the reel caption style (JSON string) for one post. */
export async function setGoldCaptionStyle(id: string, style: string): Promise<boolean> {
  await run('UPDATE gold_content SET caption_style = ? WHERE id = ?', [style, id]);
  return true;
}
```

- [ ] **Step 2: Map it on read and accept it on write**

`app/api/posts/route.ts` — in the GET row mapping, beside `videoUrl`:

```ts
        captionStyle: row.caption_style ?? undefined,
```

and a PATCH branch beside the images branch:

```ts
    if (body.id && typeof body.captionStyle === 'string') {
      await setGoldCaptionStyle(body.id, body.captionStyle);
      return NextResponse.json({ ok: true, saved: true });
    }
```

`app/types.ts` — on `PostDraft`:

```ts
  /** Reel caption style as a JSON string (preset + overrides). See deploy/caption_style.py. */
  captionStyle?: string;
```

- [ ] **Step 3: Round-trip it**

```bash
npx tsc --noEmit -p . && npm run build && launchctl kickstart -k gui/501/com.immigration.web && sleep 3
PID=$(curl -s "http://127.0.0.1:3000/api/posts?pageId=<marketId>&limit=1" | python3 -c "import json,sys;print(json.load(sys.stdin)['posts'][0]['id'])")
curl -s -X PATCH http://127.0.0.1:3000/api/posts -H 'Content-Type: application/json' \
  -d "{\"id\":\"$PID\",\"captionStyle\":\"{\\\"preset\\\":\\\"dam\\\"}\"}"
curl -s "http://127.0.0.1:3000/api/posts?pageId=<marketId>&limit=1" | python3 -c "import json,sys;print(json.load(sys.stdin)['posts'][0].get('captionStyle'))"
```
Expected: `{"preset":"dam"}` — surviving a fresh GET, which is the refresh case.

- [ ] **Step 4: Commit**

```bash
git add app/lib/lake.ts app/api/posts/route.ts app/types.ts
git commit -m "feat(video): persist caption style per post"
```

---

### Task 11: Style state and preview in the hook

**Files:**
- Modify: `app/components/useVideoGen.ts`, `app/api/video/render/route.ts`, `app/lib/videoJobs.ts`

**Interfaces:**
- Consumes: Tasks 9 and 10.
- Produces: `useVideoGen` exposes `style`, `setStyle`, `previewUrl`, `saveStyle`; `startRenderJob` accepts `style?: string`; `make-reel.py` receives `--style <json>`.

- [ ] **Step 1: Seed style from the post and debounce a preview**

In `app/components/useVideoGen.ts`:

```ts
  const [style, setStyle] = useState<Record<string, unknown>>(() => {
    try { return post.captionStyle ? JSON.parse(post.captionStyle) : { preset: 'classic' }; }
    catch { return { preset: 'classic' }; }
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Preview deliberately runs BEFORE any TTS, so it cannot use prepared media. Plate
  // precedence: media the user just uploaded -> the post's own article image -> none.
  const plate = media.find((m) => m.kind === 'image' && m.url)?.url
    ?? post.article.imageUrl ?? null;

  useEffect(() => {
    if (!script.trim()) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/video/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: script.trim().split(/\s+/).slice(0, 12).join(' '), style, plate }),
        });
        if (!res.ok) return;
        const blob = await res.blob();
        setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
      } catch { /* preview is advisory; failing it must never block a render */ }
    }, 250);
    return () => clearTimeout(t);
  }, [script, style, plate]);
```

Add a `saveStyle` callback PATCHing `/api/posts` with `{ id: post.id, captionStyle: JSON.stringify(style) }`, and include `style`, `setStyle`, `previewUrl`, `saveStyle` in the returned object.

- [ ] **Step 2: Send the style with the render**

In `render()`'s POST body add `style`. In `app/api/video/render/route.ts`, accept it and pass `style: typeof style === 'object' && style ? JSON.stringify(style) : undefined` into `startRenderJob`. In `videoJobs.ts`, add `style?: string` to the payload type and:

```ts
  if (payload.style) args.push('--style', payload.style);
```

In `make-reel.py`'s `main()`, read it (a value-taking flag, unlike the bare flags):

```python
    st_json = None
    if "--style" in sys.argv:
        i = sys.argv.index("--style")
        st_json = json.loads(sys.argv[i + 1])
        del sys.argv[i:i + 2]
```
and pass `st=st_json` into `build_content`.

- [ ] **Step 3: Build and confirm the style reaches the renderer**

```bash
npx tsc --noEmit -p . && npm run build && launchctl kickstart -k gui/501/com.immigration.web && sleep 3
curl -s -X POST http://127.0.0.1:3000/api/video/render -H 'Content-Type: application/json' \
  -d '{"emojiTitle":"T","narration":"Đây là một bài kiểm tra ngắn.","media":[],"includeIntro":false,"includeLayout":false,"style":{"preset":"dam"},"postId":"<id>"}'
```
Poll to completion, then extract a frame and confirm the captions are all-caps and oversized (the `dam` preset), not the classic look.

- [ ] **Step 4: Commit**

```bash
git add app/components/useVideoGen.ts app/api/video/render/route.ts app/lib/videoJobs.ts deploy/make-reel.py
git commit -m "feat(video): thread caption style from the drawer through to the renderer"
```

---

### Task 12: Style panel UI *(completes S2)*

**Files:**
- Modify: `app/components/VideoGenModal.tsx`
- Create: `app/lib/captionPresets.ts` (thin re-export of the shared JSON, so the client never imports Python-adjacent paths)

**Interfaces:**
- Consumes: Task 11's `style`/`setStyle`/`previewUrl`/`saveStyle`.
- Produces: the panel; no exports consumed elsewhere.

- [ ] **Step 1: Expose the shared preset table to the client**

```ts
// app/lib/captionPresets.ts
// The SAME file deploy/caption_style.py reads. One table, two readers - a preset defined
// twice will drift, and the preview would then disagree with the render.
import presets from '../../deploy/assets/caption-presets.json';

export type PresetKey = keyof typeof presets;
export const PRESETS = presets as Record<string, { label: string } & Record<string, unknown>>;
```

Verify Next can import from outside `app/` — if the build rejects it, move the JSON to `app/lib/caption-presets.json` and update `PRESETS_PATH` in `deploy/caption_style.py` to match. Do not duplicate the file.

- [ ] **Step 2: Add the panel**

In `VideoGenModal.tsx`, after the Script section's `<Separator />`:

```tsx
          {/* ─── Caption style ─── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Kiểu phụ đề</h3>

            {vg.previewUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={vg.previewUrl} alt="Xem trước phụ đề"
                className="w-full max-w-[220px] mx-auto rounded-md border border-border" />
            )}

            <div className="flex gap-2 overflow-x-auto pb-1">
              {Object.entries(PRESETS).map(([key, p]) => (
                <button key={key}
                  onClick={() => vg.setStyle({ preset: key })}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap border transition-colors ${
                    vg.style.preset === key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-foreground border-border hover:bg-accent'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer text-primary font-medium">Tuỳ chỉnh</summary>
              <div className="pt-3 space-y-3">
                {([
                  ['size', 'Cỡ chữ', 24, 160, 1],
                  ['pos', 'Vị trí dọc', 0, 0.95, 0.01],
                  ['wordsPerCue', 'Số từ mỗi dòng', 1, 12, 1],
                  ['maxLines', 'Số dòng', 1, 4, 1],
                ] as const).map(([k, label, min, max, stepv]) => (
                  <label key={k} className="flex items-center gap-3 text-xs">
                    <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
                    <input type="range" min={min} max={max} step={stepv} className="flex-1"
                      value={Number(vg.style[k] ?? DEFAULT_VIEW[k])}
                      onChange={(e) => vg.setStyle({ ...vg.style, [k]: Number(e.target.value) })} />
                    <span className="w-12 text-right font-mono">
                      {k === 'pos'
                        ? `${Math.round(Number(vg.style[k] ?? DEFAULT_VIEW[k]) * 100)}%`
                        : String(vg.style[k] ?? DEFAULT_VIEW[k])}
                    </span>
                  </label>
                ))}

                <label className="flex items-center gap-2 text-xs cursor-pointer w-fit">
                  <input type="checkbox" className="w-4 h-4 accent-primary"
                    checked={vg.style.case === 'upper'}
                    onChange={(e) => vg.setStyle({ ...vg.style, case: e.target.checked ? 'upper' : 'none' })} />
                  IN HOA toàn bộ
                </label>

                <Button variant="outline" size="sm" onClick={vg.saveStyle} className="text-xs h-7">
                  Lưu kiểu cho bài này
                </Button>
              </div>
            </details>
          </div>
```

Add at the top of the file, so the sliders show real numbers before the user touches anything:

```tsx
import { PRESETS } from '@/app/lib/captionPresets';

// Mirrors DEFAULTS in deploy/caption_style.py for display only; the renderer resolves
// the real values, so a drift here changes the slider's starting position, nothing more.
const DEFAULT_VIEW: Record<string, number> = { size: 64, pos: 780 / 1920, wordsPerCue: 5, maxLines: 2 };
```

- [ ] **Step 3: Build and screenshot**

```bash
npx tsc --noEmit -p . && npm run build && launchctl kickstart -k gui/501/com.immigration.web && sleep 3
```
Open a post → Tạo Video → approve a script. Confirm the preview image appears within ~1s, changing a preset visibly changes it, and the sliders move it. **S2 is complete at this point.**

- [ ] **Step 4: Full regression pass**

```bash
python3 deploy/caption_style.py --demo
python3 deploy/make-reel.py --demo
python3 deploy/check-fonts.py
npx tsc --noEmit -p . && npm run build
```
Then render one post with **no style set at all** and confirm it is visually identical to a reel rendered before this work — the Global Constraint that must not have moved.

- [ ] **Step 5: Commit**

```bash
git add app/components/VideoGenModal.tsx app/lib/captionPresets.ts
git commit -m "feat(video): caption style presets + live preview in the drawer"
```
