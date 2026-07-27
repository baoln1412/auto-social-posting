#!/usr/bin/env python3
"""One long video -> N ranked vertical shorts. Transcribe locally (faster-whisper, already
installed), rank the moments with `claude -p` under a schema, cut with ffmpeg. $0 beyond the
Claude subscription.

This is the transferable half of SamurAIGPT/AI-Youtube-Shorts-Generator: the virality rubric.
Its face-tracking crop is deliberately NOT copied — faceless slide/chart content has no face to
track, so a centre crop is both correct and free.

Run with the python that owns faster-whisper: /opt/homebrew/bin/python3

Usage: make-shorts.py <video.mp4> [count] [outdir]
       make-shorts.py --demo          # offline self-check
"""
import json, os, subprocess, sys

MODEL = os.environ.get("SHORTS_MODEL", "sonnet")
MIN_S, MAX_S = 20, 60

SCHEMA = {
    "type": "object",
    "properties": {"clips": {"type": "array", "items": {
        "type": "object",
        "properties": {"start": {"type": "number"}, "end": {"type": "number"},
                       "title": {"type": "string"}, "score": {"type": "number"},
                       "reason": {"type": "string"}},
        "required": ["start", "end", "title", "score", "reason"]}}},
    "required": ["clips"],
}

RUBRIC = """You pick the moments of a video most likely to work as standalone vertical shorts.

Score each candidate 0-1 on these signals, and return the {count} strongest:
- hook: the first 3 seconds must make someone stop scrolling
- emotional peak: surprise, tension, a strong opinion, a reversal
- quotable: one line that stands alone out of context
- practical value: the viewer can act on it

Hard rules: each clip is {min_s}-{max_s} seconds, starts and ends on a COMPLETE thought (never
mid-sentence), and must make sense with no surrounding context. Prefer a clean self-contained
point over a longer rambling one. `title` is the on-screen hook, not a description.

TRANSCRIPT (each line is `start-end text`, seconds):
{transcript}"""


def transcribe(video, lang=None):
    from faster_whisper import WhisperModel
    segs, info = WhisperModel("small", device="cpu", compute_type="int8").transcribe(
        video, language=lang, vad_filter=True)
    return [(s.start, s.end, s.text.strip()) for s in segs if s.text.strip()]


def rank(segments, count=3, model=MODEL):
    lines = "\n".join(f"{a:.1f}-{b:.1f} {t}" for a, b, t in segments)
    prompt = RUBRIC.format(count=count, min_s=MIN_S, max_s=MAX_S, transcript=lines[:120000])
    proc = subprocess.run(["claude", "-p", prompt, "--output-format", "json",
                           "--model", model, "--json-schema", json.dumps(SCHEMA)],
                          capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        raise RuntimeError(f"claude exited {proc.returncode}: {proc.stderr[:400]}")
    return json.loads(proc.stdout)["structured_output"]["clips"]


def snap(clip, segments):
    """Pull the model's start/end onto the nearest real segment boundary. It reads timings out of
    prose and drifts a beat, which is exactly how a short ends up clipping the first syllable."""
    if not segments:
        return clip["start"], clip["end"]
    starts = [a for a, _, _ in segments]
    ends = [b for _, b, _ in segments]
    a = min(starts, key=lambda s: abs(s - clip["start"]))
    b = min(ends, key=lambda e: abs(e - clip["end"]))
    if b - a < MIN_S:                       # too tight after snapping -> extend to the rubric floor
        b = min(max(ends), a + MIN_S)
    return a, min(b, a + MAX_S)


def cut(video, a, b, out):
    cmd = ["ffmpeg", "-y", "-ss", f"{a:.2f}", "-t", f"{b - a:.2f}", "-i", video,
           "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1",
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-r", "30", out]
    return subprocess.run(cmd, capture_output=True, text=True).returncode == 0


def demo():
    segs = [(0.0, 4.0, "a"), (4.0, 9.0, "b"), (9.0, 40.0, "c"), (40.0, 75.0, "d")]
    a, b = snap({"start": 4.3, "end": 39.2}, segs)
    assert (a, b) == (4.0, 40.0), f"snapped to boundaries, got {(a, b)}"
    a, b = snap({"start": 0.1, "end": 3.4}, segs)          # 4s clip -> stretched to the floor
    assert b - a >= MIN_S, f"short clip should extend to {MIN_S}s, got {b - a}"
    a, b = snap({"start": 0.0, "end": 999}, segs)          # runaway end -> capped
    assert b - a <= MAX_S, f"clip should cap at {MAX_S}s, got {b - a}"
    assert snap({"start": 1, "end": 2}, []) == (1, 2)      # no transcript -> pass through
    print("make-shorts.py self-check ok")


def main():
    if "--demo" in sys.argv:
        demo(); return
    video = sys.argv[1]
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    outdir = sys.argv[3] if len(sys.argv) > 3 else os.path.expanduser("~/Downloads/shorts")
    os.makedirs(outdir, exist_ok=True)
    print("transcribing…")
    segs = transcribe(video)
    print(f"  {len(segs)} segments; ranking…")
    for i, c in enumerate(sorted(rank(segs, count), key=lambda c: -c["score"])[:count], 1):
        a, b = snap(c, segs)
        out = os.path.join(outdir, f"short{i}.mp4")
        ok = cut(video, a, b, out)
        print(f"  [{c['score']:.2f}] {a:.1f}-{b:.1f}s  {c['title']}\n      {'OUT: ' + out if ok else 'CUT FAILED'}")


if __name__ == "__main__":
    main()
