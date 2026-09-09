#!/usr/bin/env python3
"""
MVP+: one gold post -> one 9:16 branded reel. Fully local, $0.
  voice    = Edge-TTS (free, vi-VN, no key) -> mp3 + sentence timings
  captions = punctuation-aware cues (comma/period pause points, capped at a max word count),
             drawn white with the word being spoken flipped to yellow. The whole band is
             pre-composited into ONE alpha clip (PIL frames -> qtrle .mov) rather than an
             ffmpeg overlay per word: measured on a 15s clip, 30 overlays render in 2.9s but
             150 take 39.7s. (PIL because this ffmpeg lacks drawtext/libass.)
  frame    = deploy/assets/frame.png (101 CHUYỆN ÚC blue block + logo + vertical bar) - optional,
             see --no-layout
  title    = inside the blue block; per-word colour via title_segments() - "**kw**" markup
             or a colon-split title puts the headline half in brand yellow, everything else
             white. Word-wrapped, stroked, rendered once to a PNG (render_title()). Skipped
             along with the frame under --no-layout - captions still render either way.
  intro    = deploy/assets/intro.mp4 spliced in AFTER the hook (first sentence) - optional,
             see --no-intro
  render   = FFmpeg Ken Burns per image (concat if multiple) + overlay composite,
             then concat hook|intro|body

Usage: make-reel.py <marketId> <index> [out.mp4]
   or: make-reel.py --json <payload.json> [out.mp4]   (web UI one-click render;
   add --validate anywhere to stop after the voice: writes <out>.mp3 and prints the narration,
       so you hear the direction before paying for media fetch + the full ffmpeg render.
       add --no-intro to skip the branded intro clip.
       add --no-layout to skip the frame + title overlay (captions and voice still render).
       payload = {"emojiTitle", "narration" (approved script, overrides auto-lead),
                  "media": [{"url", "kind": "image"|"video"}, ...] (ordered, split
                  evenly across the reel; video clips are trimmed to their slot;
                  falls back to article.imageUrl)})
Skipped (add later): top big-number zone, background music, SFX - all three need a real asset
source decided first (which track/sound, and is it actually royalty-free), not just code; the
yellow keyword highlight this comment used to list here shipped a while back (title_segments()
+ render_title()) and this note just never got updated. Core proven, $0 local.
"""
import sys, os, re, json, asyncio, subprocess, array, urllib.request, difflib, unicodedata, shutil
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import caption_style

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "public", "fonts", "BeVietnamPro-Bold.ttf")
FRAME = os.path.join(ROOT, "deploy", "assets", "frame.png")
INTRO = os.path.join(ROOT, "deploy", "assets", "intro.mp4")
LANG = (os.environ.get("REEL_LANG") or "vi").lower()      # REEL_LANG=en for the English channel
VOICES = {"vi": "vi-VN-HoaiMyNeural", "en": "en-US-AriaNeural"}
VOICE = os.environ.get("REEL_VOICE") or VOICES.get(LANG, VOICES["vi"])
W, H = 1080, 1920
CAP_Y_DEFAULT = 780                   # kept for reference; real value comes from the style
TITLE_X, TITLE_Y, TITLE_W = 185, 1420, 840   # title inside the blue block, right of the bar
WHITE, YELLOW = (255, 255, 255, 255), (255, 221, 0, 255)
CAP_BASE, CAP_ACTIVE = WHITE, YELLOW   # captions read white, the word being spoken flips to brand yellow
EMOJI = re.compile("[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF\U0000FE0F]")

# Progress markers. The web UI reads these off stdout (app/lib/videoJobs.ts) to show which
# stage is running; anything else printed here is human-facing noise and is ignored by it.
# Keep the format exact - it is a contract with the parser on the other side.
def fmt_step(name, state="start"):
    return f"::step:{name}:{state}"

def step(name, state="start"):
    print(fmt_step(name, state), flush=True)

def clean(s):
    s = EMOJI.sub("", s or ""); s = re.sub(r"#\S+", "", s); s = re.sub(r"[*_#>]", "", s)
    return re.sub(r"[ \t]+", " ", s).strip()

def fold(s):  # diacritic/punct-insensitive key for aligning my text to whisper's (error-prone) text
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)

def narration(post):
    title = clean(post.get("emojiTitle", "")).rstrip(":").strip()
    lead = (post.get("facebookText", "") or "").split("🔹")[0]
    lead = clean(lead.split("\n\n")[0] if "\n\n" in lead else lead)
    return (title + ". " + lead).strip()[:600]

async def tts(text, mp3):
    import edge_tts
    sents = []
    # edge-tts is an unofficial, reverse-engineered API to Microsoft's service — a bare
    # NoAudioReceived (dropped websocket, transient server hiccup) is a known, common
    # failure mode with no retry of its own, and previously killed the whole render.
    for attempt in range(3):
        sents = []
        try:
            comm = edge_tts.Communicate(text, VOICE, rate="+25%")
            with open(mp3, "wb") as f:
                async for ch in comm.stream():
                    if ch["type"] == "audio":
                        f.write(ch["data"])
                    elif ch["type"] == "SentenceBoundary":
                        sents.append((ch["offset"] / 1e7, ch["duration"] / 1e7))
            break
        except edge_tts.exceptions.NoAudioReceived:
            if attempt == 2:
                raise
            print(f"  tts: NoAudioReceived, retrying ({attempt + 1}/3)...")
            await asyncio.sleep(2 * (attempt + 1))
    total = (sents[-1][0] + sents[-1][1]) if sents else 0.0
    hook_end = (sents[0][0] + sents[0][1]) if sents else 0.0
    return total, hook_end

_WM = None
def whisper_words(mp3):
    """Real per-word (start,end,text) from the generated voice. Timing only — its VN
    transcription has errors, so we keep OUR text and borrow only its timings."""
    global _WM
    from faster_whisper import WhisperModel
    if _WM is None:
        _WM = WhisperModel("small", device="cpu", compute_type="int8")
    segs, _ = _WM.transcribe(mp3, language=LANG, word_timestamps=True)
    return [(w.start, w.end, w.word.strip()) for s in segs for w in s.words if w.word.strip()]

def chunk_words(mw, max_size):
    """Group word indices at natural pauses (punctuation) first, only falling back to
    a max word count for long clauses with none — reads more naturally on screen than
    a fixed-size chunk that can split mid-clause."""
    groups, cur = [], []
    for i, w in enumerate(mw):
        cur.append(i)
        if re.search(r"[.,!?;:…]$", w) or len(cur) >= max_size:
            groups.append(cur); cur = []
    if cur:
        groups.append(cur)
    return groups

def align_cues(text, ww, dur, size=5):
    """Align our exact words onto whisper's real timings (difflib), then chunk into cues
    at punctuation (comma/period/etc), capped at `size` words. Guarantees correct
    text + voice-accurate timing."""
    mw = re.findall(r"\S+", text)
    if not mw:
        return []
    times = [None] * len(mw)
    if ww:
        a = [fold(w) for w in mw]; b = [fold(w[2]) for w in ww]
        for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
            if tag in ("equal", "replace") and j2 > j1:
                for k in range(i1, i2):
                    j = min(j1 + int((k - i1) * (j2 - j1) / max(1, i2 - i1)), j2 - 1)
                    times[k] = (ww[j][0], ww[j][1])
    known = [i for i, t in enumerate(times) if t]
    if not known:                                   # whisper empty/no match -> even split
        per = dur / len(mw)
        times = [(i * per, (i + 1) * per) for i in range(len(mw))]
    else:                                           # linearly interpolate unmatched gaps
        for i in range(len(mw)):
            if times[i]:
                continue
            left = [k for k in known if k < i]; right = [k for k in known if k > i]
            li, ls = (left[-1], times[left[-1]][1]) if left else (-1, 0.0)
            ri, rs = (right[0], times[right[0]][0]) if right else (len(mw), dur)
            span = max(1, ri - li)
            times[i] = (ls + (rs - ls) * (i - li) / span, ls + (rs - ls) * (i + 1 - li) / span)
    cues = []
    for g in chunk_words(mw, size):
        cues.append((times[g[0]][0], times[g[-1]][1],
                     [(mw[k], times[k][0], times[k][1]) for k in g]))
    return cues

def layout_words(d, words, font, box_w):
    """Wrap `words` into centred lines -> ([(line_words, line_width)], space_width). Word-level
    layout, because the caption has to know where each individual word sits to colour one of them."""
    sp = d.textlength(" ", font=font)
    lines, cur, cw = [], [], 0.0
    for w in words:
        wl = d.textlength(w, font=font)
        if cur and cw + sp + wl > box_w:
            lines.append((cur, cw)); cur, cw = [], 0.0
        cur.append((w, wl)); cw += (sp if len(cur) > 1 else 0) + wl
    if cur:
        lines.append((cur, cw))
    return lines, sp


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


def active_word(cues, t):
    """(cue index, word index) being spoken at `t`, or None between cues."""
    for ci, (a, b, words) in enumerate(cues):
        if a <= t < b:
            wi = 0
            for k, (_, ws, _we) in enumerate(words):
                if ws <= t:
                    wi = k
            return ci, wi
    return None


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
    last_pct = -5
    for f in range(n):
        pct = int(f * 100 / n)
        if pct >= last_pct + 5:
            step("captions", f"{pct}%")
            last_pct = pct
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


def title_segments(title):
    """(word, colour) list. `**kw**` -> yellow; else country/prefix white, headline yellow."""
    title = clean(title).rstrip(":").strip()
    if "**" in title:
        segs = []
        for i, part in enumerate(re.split(r"\*\*", title)):
            col = YELLOW if i % 2 == 1 else WHITE
            segs += [(w, col) for w in part.split()]
        return segs
    if ":" in title:
        pre, post = title.split(":", 1)
        return [(w, WHITE) for w in (pre + ":").split()] + [(w, YELLOW) for w in post.split()]
    return [(w, YELLOW) for w in title.split()]

def render_title(path, segs, fontsize, box_w, stroke_w):
    font = ImageFont.truetype(FONT, fontsize)
    m = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    sp = m.textlength(" ", font=font)
    lines, cur, cw = [], [], 0.0
    for word, col in segs:
        wl = m.textlength(word, font=font)
        if cur and cw + sp + wl > box_w:
            lines.append(cur); cur, cw = [], 0.0
        cur.append((word, col, wl)); cw += (sp if len(cur) > 1 else 0) + wl
    if cur:
        lines.append(cur)
    lh = fontsize + 16
    h = lh * len(lines) + 30
    img = Image.new("RGBA", (box_w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    y = 15
    for line in lines:
        x = 0
        for word, col, wl in line:
            d.text((x, y), word, font=font, fill=col, stroke_width=stroke_w, stroke_fill=(0, 0, 0, 255))
            x += wl + sp
        y += lh
    img.save(path)
    return h

def fetch_image(url, dst):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        open(dst, "wb").write(urllib.request.urlopen(req, timeout=20).read())
        return os.path.getsize(dst) > 1000
    except Exception as e:
        print("  image fetch failed:", e); return False

def fetch_video(url, dst):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        open(dst, "wb").write(urllib.request.urlopen(req, timeout=60).read())
        return os.path.getsize(dst) > 1000
    except Exception as e:
        print("  video fetch failed:", e); return False

def video_duration(path):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                            "-of", "csv=p=0", path], capture_output=True, text=True, timeout=10)
        return float(r.stdout.strip())
    except Exception:
        return 0.0

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


def slideshow_risk(bg_items, dur, per=10.0):
    """Warn when the reel is really a slideshow. A Ken Burns pan over one or two stills stretched
    across a minute is the exact failure mode OpenMontage flags, and it is what this pipeline
    produces by default when a post ships a single picture."""
    if any(b["kind"] == "video" for b in bg_items):
        return None
    want = max(1, int(dur / per))
    if len(bg_items) < want:
        return (f"slideshow risk: {len(bg_items)} still(s) across {dur:.0f}s — "
                f"want ~{want} images or some video b-roll (stock.py)")
    return None


def get_media(post):
    """Ordered [{"url","kind"}] for the slideshow. New (--json) callers send
    `media`; the old marketId/index path only ever had a single article.imageUrl."""
    media = [m for m in (post.get("media") or []) if m.get("url")]
    if media:
        return [{"url": m["url"], "kind": m.get("kind") or "image"} for m in media]
    single = post.get("article", {}).get("imageUrl")
    return [{"url": single, "kind": "image"}] if single else []

import hashlib

def project_key(post):
    """Identity of the EXPENSIVE work (voice + alignment + fetched media), so a project
    can be reused. Style is excluded on purpose: restyling is exactly the case that must
    not pay for TTS and whisper again. When `narration` is absent, prepare() synthesises
    it from emojiTitle+facebookText (see narration()) - the key has to hash what prepare()
    will actually speak, or two different auto-narrated posts collide on the same key."""
    parts = [(post.get("narration") or narration(post) or "").strip()]
    for m in get_media(post):   # same url/imageUrl fallback prepare() uses to fetch media
        parts.append(f"{m['kind']}:{m['url']}")
    # \x1f (unit separator) can't appear in narration text or a URL, unlike a space or
    # comma - joining with one of those could let a field boundary shift produce the same
    # hash (narration ending in "cat" + next field "1" == narration "cat1" + no next field).
    return hashlib.sha1("\x1f".join(parts).encode("utf-8")).hexdigest()

def take_flag(argv, name):
    """Pull a bare flag out of argv wherever it sits, so the positional args keep their places."""
    rest = [a for a in argv if a != name]
    return rest, len(rest) != len(argv)


def prepare(post, work_dir):
    """Expensive, style-independent half: voice, word timings, media on disk, waveform.
    Returns the project dict and writes it to work_dir/project.json."""
    os.makedirs(work_dir, exist_ok=True)
    proj_path = os.path.join(work_dir, "project.json")
    if os.path.exists(proj_path):
        try:
            with open(proj_path, encoding="utf-8") as f:
                proj = json.load(f)
            # A hit is only real if every file it points at is still on disk - a partially
            # deleted work dir, or a project.json truncated by an interrupted prepare, must
            # fall through to a full rebuild rather than hand back a project ffmpeg can't use.
            hit = (proj.get("key") == project_key(post)
                   and os.path.exists(os.path.join(work_dir, proj["audio"]))
                   and all(os.path.exists(os.path.join(work_dir, m["path"])) for m in proj["media"]))
        except Exception:
            hit = False
        if hit:
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
        step("tts", "failed")
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
    tmp_path = proj_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(proj, f, ensure_ascii=False)
    os.replace(tmp_path, proj_path)   # atomic - a crash mid-write must never leave a truncated project.json
    return proj


def render_from_project(proj, work_dir, out, st, include_layout=True):
    """Cheap, style-dependent half. Everything expensive already happened in prepare();
    this reads its output and composites. Returns (dur, hook_end) or None."""
    st = caption_style.resolve(st if isinstance(st, dict) else None)
    dur, hook_end = proj["dur"], proj["hookEnd"]
    mp3 = os.path.join(work_dir, proj["audio"])
    # Cues are rebuilt here, not cached: wordsPerCue is a STYLE knob, so the chunking has
    # to be redone whenever the style changes - while the word timings underneath it, the
    # part that cost a whisper pass, are reused as-is.
    ww = [(s, e, w) for w, s, e in proj["words"]]
    cues = align_cues(proj["narration"], ww, dur, size=st["wordsPerCue"])
    print(f"  voice: {dur:.1f}s, {len(cues)} cues, hook_end {hook_end:.1f}s")
    bg_items = [{"path": os.path.join(work_dir, m["path"]), "kind": m["kind"]}
                for m in proj["media"]]
    post = {"emojiTitle": proj.get("emojiTitle", "")}     # only the title overlay needs it
    n_bg = max(1, len(bg_items))  # background segments: one per media item, or 1 solid-color fallback
    target = dur / n_bg
    # A video clip shorter than its equal time-share can't fill it — trim can't pad,
    # and the leftover would otherwise show up as a frozen last frame at the very end
    # while narration keeps playing. Cap short clips to their own length and hand the
    # leftover time to the other segments instead.
    vdur = {i: video_duration(it["path"]) for i, it in enumerate(bg_items) if it["kind"] == "video"}
    short = {i: d for i, d in vdur.items() if 0 < d < target}
    leftover = sum(target - d for d in short.values())
    others = [i for i in range(len(bg_items)) if i not in short]
    bonus = leftover / len(others) if others else 0
    seg_durs = [short[i] if i in short else target + bonus for i in range(len(bg_items))] or [target]
    print(f"  background: {len(bg_items)} item(s) -> {n_bg} segment(s)" if bg_items else "  background: solid color (no media)")
    risk = slideshow_risk(bg_items, dur)
    if risk:
        print("  ⚠ " + risk)

    # Named per-PID: prepare()'s outputs (v.mp3, bg*, project.json) are shared and idempotent,
    # but two renders of the SAME project (e.g. the render-two-styles case this split exists
    # for) run concurrently and must not read/write each other's half-written caption/title
    # assets in the now-persistent work_dir.
    pid = os.getpid()
    title_png = os.path.join(work_dir, f"title-{pid}.png")
    caps_mov = os.path.join(work_dir, f"caps-{pid}.mov")

    def cleanup():
        for p in (title_png, caps_mov):
            if os.path.exists(p):
                os.remove(p)

    if include_layout:
        th = render_title(title_png, title_segments(post.get("emojiTitle", "")), 50, TITLE_W, 4)
    step("captions")
    if not render_caption_track(caps_mov, cues, dur, st):
        step("captions", "failed")
        cleanup()
        return None
    step("captions", "done")

    inputs = []
    if bg_items:
        # zoompan's `d=` expands EACH incoming frame into `d` output frames — feed it
        # exactly one frame per image (framerate 1, trimmed to 1s), not a full-rate
        # loop, else a branch balloons to (input frames * d) and concat's per-segment
        # boundaries — and durations — blow way past the intended length. Video clips
        # already have motion — read normally, trimmed to their slot in the filter below.
        for it in bg_items:
            if it["kind"] == "video":
                inputs += ["-i", it["path"]]
            else:
                inputs += ["-loop", "1", "-framerate", "1", "-t", "1", "-i", it["path"]]
    else:
        inputs += ["-f", "lavfi", "-i", f"color=c=0x0a2a6b:s={W}x{H}:r=30"]
    if include_layout:
        inputs += ["-loop", "1", "-i", title_png, "-i", caps_mov]
        inputs += ["-loop", "1", "-i", FRAME, "-i", mp3]
        title_idx = n_bg
        cap_idx = n_bg + 1
        frame_idx = n_bg + 2
        audio_idx = n_bg + 3
    else:
        inputs += ["-i", caps_mov, "-i", mp3]
        cap_idx = n_bg
        audio_idx = n_bg + 1

    # one Ken Burns zoom per image segment (or a trimmed clip per video segment),
    # concatenated if there's more than one. Video segments' own audio is never
    # mapped downstream, so it's silently dropped — narration is the only audio track.
    seg_labels = [f"bgseg{i}" for i in range(n_bg)] if n_bg > 1 else ["bg"]
    parts = []
    if bg_items:
        for i, (it, lbl) in enumerate(zip(bg_items, seg_labels)):
            sd = seg_durs[i]
            if it["kind"] == "video":
                parts.append(
                    f"[{i}:v]trim=0:{sd:.3f},setpts=PTS-STARTPTS,"
                    f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,fps=30[{lbl}]"
                )
            else:
                frames = max(1, int(round(sd * 30)))
                parts.append(
                    f"[{i}:v]scale=1350:2400:force_original_aspect_ratio=increase,crop=1350:2400,"
                    f"zoompan=z='min(zoom+0.0004,1.2)':d={frames}:s={W}x{H}:fps=30,setsar=1[{lbl}]"
                )
    else:
        parts.append(f"[0:v]setsar=1[{seg_labels[0]}]")
    if n_bg > 1:
        parts.append("".join(f"[{lbl}]" for lbl in seg_labels) + f"concat=n={n_bg}:v=1:a=0[bg]")

    # one pre-composited caption strip (see render_caption_track), then - if the branded layout
    # wasn't switched off - the frame on top, then the title inside its blue block.
    parts.append(f"[bg][{cap_idx}:v]overlay=0:{caption_style.cap_y(st, H)}[cap]")
    out_label = "cap"
    if include_layout:
        parts.append(f"[cap][{frame_idx}:v]overlay=0:0[fr]")
        parts.append(f"[fr][{title_idx}:v]overlay={TITLE_X}:{TITLE_Y}[v]")
        out_label = "v"
    fc = ";".join(parts)

    cmd = ["ffmpeg", "-y", *inputs, "-filter_complex", fc, "-map", f"[{out_label}]", "-map", f"{audio_idx}:a",
           "-t", f"{dur:.2f}", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
           "-ar", "44100", "-ac", "2", "-r", "30", "-shortest", out]
    step("compose")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        step("compose", "failed")
        print(r.stderr[-1800:])
        cleanup()
        return None
    step("compose", "done")
    cleanup()
    return dur, hook_end


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
    # emojiTitle is style, not script - it isn't in project_key, so a title-only edit hits
    # the cache but must still render the CURRENT title, not the one prepare() snapshotted.
    proj = {**proj, "emojiTitle": post.get("emojiTitle", "")}
    return render_from_project(proj, tmp, content, st, include_layout)

def splice_intro(content, dur, hook_end, out):
    he = max(1.0, min(hook_end, dur - 1.0))
    af = "aformat=sample_rates=44100:channel_layouts=stereo"
    intro_v = (f"[1:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
               f"setsar=1,fps=30,format=yuv420p,setpts=PTS-STARTPTS[vi];"
               f"[1:a]asetpts=PTS-STARTPTS,{af}[ai]")
    if dur < 2.5:  # too short to split -> intro then content
        fc = (intro_v + f";[0:v]setpts=PTS-STARTPTS[v0];[0:a]asetpts=PTS-STARTPTS,{af}[a0];"
              "[vi][ai][v0][a0]concat=n=2:v=1:a=1[v][a]")
    else:
        fc = (f"[0:v]trim=0:{he:.2f},setpts=PTS-STARTPTS[va];[0:a]atrim=0:{he:.2f},asetpts=PTS-STARTPTS,{af}[aa];"
              f"[0:v]trim={he:.2f},setpts=PTS-STARTPTS[vb];[0:a]atrim={he:.2f},asetpts=PTS-STARTPTS,{af}[ab];"
              + intro_v +
              ";[va][aa][vi][ai][vb][ab]concat=n=3:v=1:a=1[v][a]")
    cmd = ["ffmpeg", "-y", "-i", content, "-i", INTRO, "-filter_complex", fc,
           "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-ar", "44100", "-r", "30", out]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-1800:]); return False
    return True

def demo():
    cues = [(0.0, 1.0, [("a", 0.0, 0.5), ("b", 0.5, 1.0)]),
            (2.0, 3.0, [("c", 2.0, 3.0)])]
    assert active_word(cues, 0.1) == (0, 0)
    assert active_word(cues, 0.7) == (0, 1)          # second word once its start has passed
    assert active_word(cues, 1.5) is None            # gap between cues -> blank strip
    assert active_word(cues, 2.5) == (1, 0)
    assert active_word(cues, 99) is None
    img = render_cue(cues[0][2], 1, caption_style.resolve(None))
    assert img.mode == "RGBA"
    d = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    font = ImageFont.truetype(FONT, 64)
    lines, _ = layout_words(d, ["word"] * 12, font, W - 60)
    assert len(lines) > 1, "a long cue must wrap instead of running off the frame"
    assert sum(len(l) for l, _ in lines) == 12, "wrapping must not drop or duplicate a word"

    img = [{"kind": "image"}]
    assert slideshow_risk(img, 60) and "slideshow risk" in slideshow_risk(img, 60)
    assert slideshow_risk(img * 6, 60) is None                  # enough stills -> fine
    assert slideshow_risk([{"kind": "video"}], 60) is None      # motion footage -> never a slideshow
    assert slideshow_risk(img, 8) is None                       # short reel, one still is fine

    # --validate must come out of argv wherever it sits, or the positional market/index shift
    assert take_flag(["x", "m", "3"], "--validate") == (["x", "m", "3"], False)
    assert take_flag(["x", "--validate", "m", "3"], "--validate") == (["x", "m", "3"], True)
    assert take_flag(["x", "m", "3", "--validate"], "--validate") == (["x", "m", "3"], True)

    # --- caption style ---------------------------------------------------------
    st = caption_style.resolve(None)
    words = [("MỘT", 0.0, 0.3), ("HAI", 0.3, 0.6)]
    img = render_cue(words, 0, st)
    assert img.mode == "RGBA" and img.size == (W, caption_style.band_height(st)), img.size

    def _has(im, rgb, tol=12):
        data = im.tobytes()
        for i in range(0, len(data), 4):
            r, g, b, a = data[i], data[i+1], data[i+2], data[i+3]
            if a > 200 and abs(r-rgb[0]) <= tol and abs(g-rgb[1]) <= tol and abs(b-rgb[2]) <= tol:
                return True
        return False

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

    # --- step markers ----------------------------------------------------------
    assert fmt_step("media", "2/5") == "::step:media:2/5"
    assert fmt_step("tts") == "::step:tts:start"
    assert fmt_step("intro", "skipped") == "::step:intro:skipped"
    assert fmt_step("captions", "failed") == "::step:captions:failed"

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
    # Auto-narration posts must not collide: prepare() synthesises narration from
    # emojiTitle+facebookText when the field is absent, so the key has to cover them.
    assert project_key({"emojiTitle": "A"}) != project_key({"emojiTitle": "B"})

    print("make-reel.py self-check ok")


def main():
    sys.argv[:], validate = take_flag(sys.argv, "--validate")
    sys.argv[:], no_intro = take_flag(sys.argv, "--no-intro")
    sys.argv[:], no_layout = take_flag(sys.argv, "--no-layout")
    sys.argv[:], only_prepare = take_flag(sys.argv, "--prepare")
    sys.argv[:], only_render = take_flag(sys.argv, "--render")
    if sys.argv[1] == "--demo":
        demo(); return
    if sys.argv[1] == "--json":
        post = json.load(open(sys.argv[2]))
        out = sys.argv[3] if len(sys.argv) > 3 else os.path.expanduser("~/Downloads/reel-demo.mp4")
    else:
        market, index = sys.argv[1], int(sys.argv[2])
        out = sys.argv[3] if len(sys.argv) > 3 else os.path.expanduser("~/Downloads/reel-demo.mp4")
        posts = json.load(urllib.request.urlopen(f"http://localhost:3000/api/posts?pageId={market}&limit=30"))["posts"]
        post = posts[index]
    print("Post:", post.get("emojiTitle", "")[:60])

    # Keyed by inputs, not random per run - so two posts with identical narration + media
    # share one prepare, and a second render of the SAME post (a restyle) hits the cache.
    tmp = os.path.join(ROOT, "data", "reels", "work", project_key(post))
    # Per-PID: this work_dir is now shared/persistent across runs, so two concurrent
    # renders of the same post must not race on one content.mp4.
    content = os.path.join(tmp, f"content-{os.getpid()}.mp4")

    if only_prepare:
        proj = prepare(post, tmp)
        if not proj:
            print("prepare failed"); sys.exit(1)
        print("PREPARED:", tmp)
        return

    if only_render:
        proj_path = os.path.join(tmp, "project.json")
        if not os.path.exists(proj_path):
            print("no prepared project at", tmp, "- run --prepare first"); sys.exit(1)
        with open(proj_path, encoding="utf-8") as f:
            proj = json.load(f)
        # same live-title override as the build_content shim (see there for why)
        proj = {**proj, "emojiTitle": post.get("emojiTitle", "")}
        res = render_from_project(proj, tmp, content, None, include_layout=not no_layout)
    else:
        res = build_content(tmp, post, content, validate_to=(out + ".mp3") if validate else None,
                             include_layout=not no_layout)
        if validate:
            return
    if not res:
        print("content build failed"); sys.exit(1)
    dur, hook_end = res
    if no_intro:
        step("intro", "skipped")
        print("  intro skipped (--no-intro)…")
        shutil.move(content, out)
    else:
        step("intro")
        print("  splicing intro after hook…")
        ok = splice_intro(content, dur, hook_end, out)
        if os.path.exists(content):     # splice reads content as an input, never consumes it
            os.remove(content)
        if not ok:
            step("intro", "failed")
            print("splice failed"); sys.exit(1)
        step("intro", "done")
    print("OUT:", out)

if __name__ == "__main__":
    main()
