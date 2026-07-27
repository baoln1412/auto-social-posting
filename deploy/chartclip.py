#!/usr/bin/env python3
"""Animated line/bar chart as a 9:16 clip — the differentiator for money/market reels, where the
chart IS the content and a static PNG wastes it.

Drawn with PIL (already a make-reel.py dependency) and piped to ffmpeg as raw frames, so this adds
NO new dependency: matplotlib would be one, and Remotion would be a JS toolchain plus a company
licence. Output drops into a --json payload's media list as a normal video item.

Run with the python that owns PIL: /opt/homebrew/bin/python3

Usage: chartclip.py data.json [out.mp4]     data.json = {"title","labels":[...],"values":[...],"kind":"line"|"bar"}
       chartclip.py --demo                  # offline self-check, no ffmpeg needed
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "public", "fonts", "BeVietnamPro-Bold.ttf")
W, H, FPS = 1080, 1920, 30
BG, INK, ACCENT, GRID = (10, 42, 107), (255, 255, 255), (255, 221, 0), (255, 255, 255, 40)
PAD_X, TOP, BOT = 90, 620, 1180          # plot box, clear of the reel's caption band and title block


def ease(t):
    """Ease-out cubic — a linear draw reads mechanical, and the last frames are where the eye lands."""
    return 1 - (1 - t) ** 3


def plot_points(values, box):
    """Value list -> pixel coords inside `box` (x0,y0,x1,y1). Flat series still render mid-box
    instead of dividing by a zero range."""
    x0, y0, x1, y1 = box
    lo, hi = min(values), max(values)
    span = (hi - lo) or 1.0
    n = len(values)
    step = (x1 - x0) / max(1, n - 1)
    return [(x0 + i * step, y1 - (v - lo) / span * (y1 - y0)) for i, v in enumerate(values)]


def frame(title, labels, values, kind, t):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img, "RGBA")
    f_title, f_lab = ImageFont.truetype(FONT, 62), ImageFont.truetype(FONT, 34)
    d.text((PAD_X, TOP - 150), title, font=f_title, fill=INK)
    box = (PAD_X, TOP, W - PAD_X, BOT)
    for i in range(5):                                   # faint gridlines, drawn under the data
        y = TOP + i * (BOT - TOP) / 4
        d.line([(PAD_X, y), (W - PAD_X, y)], fill=GRID, width=2)
    pts = plot_points(values, box)
    shown = ease(max(0.0, min(1.0, t)))
    if kind == "bar":
        bw = (W - 2 * PAD_X) / (len(values) * 1.6)
        for (x, y), v in zip(pts, values):
            top = BOT - (BOT - y) * shown
            d.rectangle([x - bw / 2, top, x + bw / 2, BOT], fill=ACCENT)
    else:
        cut = shown * (len(pts) - 1)
        whole = int(cut)
        line = pts[:whole + 1]
        if whole < len(pts) - 1:                         # partial segment, so growth is smooth
            (ax, ay), (bx, by) = pts[whole], pts[whole + 1]
            k = cut - whole
            line.append((ax + (bx - ax) * k, ay + (by - ay) * k))
        if len(line) > 1:
            d.line(line, fill=ACCENT, width=9, joint="curve")
        if line:
            hx, hy = line[-1]
            d.ellipse([hx - 13, hy - 13, hx + 13, hy + 13], fill=INK)
    d.line([(PAD_X, BOT), (W - PAD_X, BOT)], fill=INK, width=3)
    for (x, _), lab in zip(pts, labels):
        w = d.textlength(str(lab), font=f_lab)
        d.text((x - w / 2, BOT + 22), str(lab), font=f_lab, fill=INK)
    return img


def render(data, out, seconds=5.0):
    title = data.get("title", "")
    values = [float(v) for v in data["values"]]
    labels = data.get("labels") or list(range(1, len(values) + 1))
    kind = data.get("kind", "line")
    n = int(seconds * FPS)
    p = subprocess.Popen(
        ["ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS), out],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    for i in range(n):
        p.stdin.write(frame(title, labels, values, kind, i / max(1, n - 1)).tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise RuntimeError(p.stderr.read().decode()[-800:])
    return out


def demo():
    assert ease(0) == 0 and ease(1) == 1
    assert ease(0.5) > 0.5, "ease-out should be ahead of linear at the midpoint"
    box = (0, 0, 100, 100)
    pts = plot_points([0, 5, 10], box)
    assert pts[0] == (0.0, 100.0) and pts[-1] == (100.0, 0.0), f"corners map to the box, got {pts}"
    assert pts[1] == (50.0, 50.0)
    flat = plot_points([7, 7, 7], box)                    # zero range must not divide by zero
    assert all(y == 100.0 for _, y in flat), flat
    assert len(plot_points([3], box)) == 1                # single point, no step blowup
    img = frame("t", ["a", "b"], [1, 2], "line", 0.5)
    assert img.size == (W, H) and img.mode == "RGB"       # rgb24 is what ffmpeg is told to expect
    print("chartclip.py self-check ok")


if __name__ == "__main__":
    if "--demo" in sys.argv:
        demo(); sys.exit(0)
    data = json.load(open(sys.argv[1]))
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser("~/Downloads/chart.mp4")
    print("OUT:", render(data, out))
