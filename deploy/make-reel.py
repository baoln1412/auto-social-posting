#!/usr/bin/env python3
"""
MVP+: one gold post -> one 9:16 branded reel. Fully local, $0.
  voice    = Edge-TTS (free, vi-VN, no key) -> mp3 + sentence timings
  captions = punctuation-aware cues (comma/period pause points, capped at a max
             word count) over the image (PIL PNG overlays; this ffmpeg lacks drawtext/libass)
  frame    = deploy/assets/frame.png (101 CHUYỆN ÚC blue block + logo + vertical bar)
  title    = white, left of nothing / right of the bar, inside the blue block
  intro    = deploy/assets/intro.mp4 spliced in AFTER the hook (first sentence)
  render   = FFmpeg Ken Burns per image (concat if multiple) + overlay composite,
             then concat hook|intro|body

Usage: make-reel.py <marketId> <index> [out.mp4]
   or: make-reel.py --json <payload.json> [out.mp4]   (web UI one-click render;
       payload = {"emojiTitle", "narration" (approved script, overrides auto-lead),
                  "media": [{"url", "kind": "image"|"video"}, ...] (ordered, split
                  evenly across the reel; video clips are trimmed to their slot;
                  falls back to article.imageUrl)})
Skipped (add later): top big-number zone, yellow keyword highlight in the title,
background music, SFX. Core proven, $0 local.
"""
import sys, os, re, json, asyncio, subprocess, tempfile, urllib.request, difflib, unicodedata
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "public", "fonts", "BeVietnamPro-Bold.ttf")
FRAME = os.path.join(ROOT, "deploy", "assets", "frame.png")
INTRO = os.path.join(ROOT, "deploy", "assets", "intro.mp4")
LANG = (os.environ.get("REEL_LANG") or "vi").lower()      # REEL_LANG=en for the English channel
VOICES = {"vi": "vi-VN-HoaiMyNeural", "en": "en-US-AriaNeural"}
VOICE = os.environ.get("REEL_VOICE") or VOICES.get(LANG, VOICES["vi"])
W, H = 1080, 1920
CAP_Y, CAP_H = 780, 150               # captions over the image
TITLE_X, TITLE_Y, TITLE_W = 185, 1420, 840   # title inside the blue block, right of the bar
WHITE, YELLOW = (255, 255, 255, 255), (255, 221, 0, 255)
EMOJI = re.compile("[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF\U0000FE0F]")

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

def wrap(text, width):
    out, line = [], ""
    for w in text.split():
        if len(line) + len(w) + 1 > width and line:
            out.append(line); line = w
        else:
            line = (line + " " + w).strip()
    if line: out.append(line)
    return out

def render_text(path, lines, fontsize, fill, stroke_w, box_w, canvas_h=None, center=True):
    font = ImageFont.truetype(FONT, fontsize)
    lh = fontsize + 14
    h = canvas_h or (lh * len(lines) + 30)
    img = Image.new("RGBA", (box_w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    y = (h - lh * len(lines)) // 2 if canvas_h else 15
    for ln in lines:
        bb = d.textbbox((0, 0), ln, font=font, stroke_width=stroke_w)
        x = ((box_w - (bb[2] - bb[0])) // 2 - bb[0]) if center else (stroke_w - bb[0])
        d.text((x, y), ln, font=font, fill=fill, stroke_width=stroke_w, stroke_fill=(0, 0, 0, 255))
        y += lh
    img.save(path)
    return h

async def tts(text, mp3):
    import edge_tts
    sents = []
    comm = edge_tts.Communicate(text, VOICE, rate="+25%")
    with open(mp3, "wb") as f:
        async for ch in comm.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "SentenceBoundary":
                sents.append((ch["offset"] / 1e7, ch["duration"] / 1e7))
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
        cues.append((times[g[0]][0], times[g[-1]][1], " ".join(mw[k] for k in g)))
    return cues

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

def get_media(post):
    """Ordered [{"url","kind"}] for the slideshow. New (--json) callers send
    `media`; the old marketId/index path only ever had a single article.imageUrl."""
    media = [m for m in (post.get("media") or []) if m.get("url")]
    if media:
        return [{"url": m["url"], "kind": m.get("kind") or "image"} for m in media]
    single = post.get("article", {}).get("imageUrl")
    return [{"url": single, "kind": "image"}] if single else []

def build_content(tmp, post, content):
    mp3 = os.path.join(tmp, "v.mp3")
    if post.get("narration"):  # approved script from the web UI overrides the auto-lead
        nar = clean(" ".join(ln.strip() for ln in post["narration"].splitlines() if ln.strip()))[:4000]
    else:
        nar = narration(post)
    dur, hook_end = asyncio.run(tts(nar, mp3))
    if dur <= 0:
        return None
    cues = align_cues(nar, whisper_words(mp3), dur)   # voice-accurate word timing
    print(f"  voice: {dur:.1f}s, {len(cues)} cues, hook_end {hook_end:.1f}s")

    bg_items = []
    for i, m in enumerate(get_media(post)):
        is_video = m["kind"] == "video"
        p = os.path.join(tmp, f"bg{i}.{'mp4' if is_video else 'jpg'}")
        ok = fetch_video(m["url"], p) if is_video else fetch_image(m["url"], p)
        if ok:
            bg_items.append({"path": p, "kind": m["kind"]})
    n_bg = max(1, len(bg_items))  # background segments: one per media item, or 1 solid-color fallback
    seg_dur = dur / n_bg
    seg_frames = max(1, int(round(seg_dur * 30)))
    print(f"  background: {len(bg_items)} item(s) -> {n_bg} segment(s)" if bg_items else "  background: solid color (no media)")

    title_png = os.path.join(tmp, "title.png")
    th = render_title(title_png, title_segments(post.get("emojiTitle", "")), 50, TITLE_W, 4)
    cap_pngs = []
    for i, (_, _, t) in enumerate(cues):
        p = os.path.join(tmp, f"c{i}.png")
        render_text(p, wrap(t, 16), 64, (255, 221, 0, 255), 7, W, canvas_h=CAP_H, center=True)
        cap_pngs.append(p)

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
    inputs += ["-loop", "1", "-i", title_png]
    for p in cap_pngs:
        inputs += ["-loop", "1", "-i", p]
    inputs += ["-loop", "1", "-i", FRAME, "-i", mp3]

    n = len(cues)
    title_idx = n_bg
    cap_start = n_bg + 1
    frame_idx = n_bg + 1 + n
    audio_idx = n_bg + 2 + n

    # one Ken Burns zoom per image segment (or a trimmed clip per video segment),
    # concatenated if there's more than one. Video segments' own audio is never
    # mapped downstream, so it's silently dropped — narration is the only audio track.
    seg_labels = [f"bgseg{i}" for i in range(n_bg)] if n_bg > 1 else ["bg"]
    parts = []
    if bg_items:
        for i, (it, lbl) in enumerate(zip(bg_items, seg_labels)):
            if it["kind"] == "video":
                parts.append(
                    f"[{i}:v]trim=0:{seg_dur:.3f},setpts=PTS-STARTPTS,"
                    f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,fps=30[{lbl}]"
                )
            else:
                parts.append(
                    f"[{i}:v]scale=1350:2400:force_original_aspect_ratio=increase,crop=1350:2400,"
                    f"zoompan=z='min(zoom+0.0004,1.2)':d={seg_frames}:s={W}x{H}:fps=30,setsar=1[{lbl}]"
                )
    else:
        parts.append(f"[0:v]setsar=1[{seg_labels[0]}]")
    if n_bg > 1:
        parts.append("".join(f"[{lbl}]" for lbl in seg_labels) + f"concat=n={n_bg}:v=1:a=0[bg]")

    cur = "bg"
    # captions over the image
    for i, (a, b, _) in enumerate(cues):
        nxt = f"c{i}"
        parts.append(f"[{cur}][{i+cap_start}:v]overlay=0:{CAP_Y}:enable=between(t\\,{a:.2f}\\,{b:.2f})[{nxt}]")
        cur = nxt
    # brand frame on top, then the title inside the blue block
    parts.append(f"[{cur}][{frame_idx}:v]overlay=0:0[fr]")
    parts.append(f"[fr][{title_idx}:v]overlay={TITLE_X}:{TITLE_Y}[v]")
    fc = ";".join(parts)

    cmd = ["ffmpeg", "-y", *inputs, "-filter_complex", fc, "-map", "[v]", "-map", f"{audio_idx}:a",
           "-t", f"{dur:.2f}", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
           "-ar", "44100", "-ac", "2", "-r", "30", "-shortest", content]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-1800:]); return None
    return dur, hook_end

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

def main():
    if sys.argv[1] == "--json":
        post = json.load(open(sys.argv[2]))
        out = sys.argv[3] if len(sys.argv) > 3 else os.path.expanduser("~/Downloads/reel-demo.mp4")
    else:
        market, index = sys.argv[1], int(sys.argv[2])
        out = sys.argv[3] if len(sys.argv) > 3 else os.path.expanduser("~/Downloads/reel-demo.mp4")
        posts = json.load(urllib.request.urlopen(f"http://localhost:3000/api/posts?pageId={market}&limit=30"))["posts"]
        post = posts[index]
    print("Post:", post.get("emojiTitle", "")[:60])

    tmp = tempfile.mkdtemp()
    content = os.path.join(tmp, "content.mp4")
    res = build_content(tmp, post, content)
    if not res:
        print("content build failed"); sys.exit(1)
    dur, hook_end = res
    print("  splicing intro after hook…")
    if not splice_intro(content, dur, hook_end, out):
        print("splice failed"); sys.exit(1)
    print("OUT:", out)

if __name__ == "__main__":
    main()
