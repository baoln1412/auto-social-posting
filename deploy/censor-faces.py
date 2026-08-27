#!/usr/bin/env python3
"""Blur every face in an image, in place of the original.

Usage:  censor-faces.py <in> <out> [<in> <out> ...]
Emits one JSON object on stdout: {"results": [{"in":…, "out":…, "faces":N}, …]}

Run it through uv so the vision deps stay out of the repo:

    uv run --python 3.12 --with opencv-python-headless --with numpy \
        deploy/censor-faces.py a.jpg a.censored.jpg

Detection is YuNet (OpenCV DNN), not a Haar cascade: OpenCV 5 dropped the bundled
cascades, and YuNet is markedly better on profiles, small and low-quality faces.

Two measurements drive the settings, both taken on real photographs:

1. The stock 0.6 confidence found ZERO faces in three crowd photographs that
   plainly contain them, at native resolution. It fails silently - "0 faces"
   reads exactly like "no faces present".
2. The two errors do not cost the same. A false positive blurs a patch of
   background. A false negative publishes an identifiable face. So this runs
   several passes at low thresholds and unions the results, deliberately
   spending precision to buy recall. On the same three photographs that took
   detections from 0 to 26, 41 and 50.

Known limit: on a DENSE crowd this still will not find every face. It is a
sizeable improvement, not a guarantee.
"""
import json
import sys
from pathlib import Path

import cv2

MODEL = Path(__file__).resolve().parent / 'assets' / 'yunet.onnx'
# (upscale, confidence, min source side). Upscaling exists to give SMALL faces more
# pixels, so it is only worth doing on an image big enough to contain small faces.
# Running 3x/0.2 on a 250px portrait produced four spurious boxes - one of them 60% of
# the frame at negative coordinates - because there is no real detail to recover.
PASSES = ((1.0, 0.30, 0), (2.0, 0.25, 600), (3.0, 0.20, 900))
PAD = 0.18          # a tight box leaves hairline, jaw and ears, which still identify
MAX_SIDE = 4000     # keep a large upscale from exhausting memory
MAX_AREA = 0.45     # a "face" bigger than this share of the frame is junk, not a close-up
PIXEL_DIVISOR = 12  # blocks per face; smaller number = coarser


def _detect(img, scale, conf):
    im = img if scale == 1.0 else cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    h, w = im.shape[:2]
    if max(h, w) > MAX_SIDE:
        return []
    det = cv2.FaceDetectorYN.create(str(MODEL), "", (w, h), conf)
    _, faces = det.detect(im)
    if faces is None:
        return []
    H, W = img.shape[:2]
    out = []
    for f in faces:
        x, y, bw, bh = (int(v / scale) for v in f[:4])
        score = float(f[-1])
        # Clamp into the frame: low-confidence passes emit boxes starting off-canvas.
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(W, x + bw), min(H, y + bh)
        if x1 <= x0 or y1 <= y0:
            continue
        if (x1 - x0) * (y1 - y0) > MAX_AREA * W * H:
            continue
        out.append(((x0, y0, x1 - x0, y1 - y0), score))
    return out


def _merge(scored, iou=0.3):
    """Suppress duplicates across passes, keeping the most confident box for a face.

    Deliberately NOT a union of overlapping boxes. Union-expand snowballs: one spurious
    large detection absorbs its neighbours, and a single portrait ended up with one box
    covering 108% of the frame, pixelating the entire photograph instead of a face.
    """
    kept = []
    for (x, y, w, h), score in sorted(scored, key=lambda s: -s[1]):
        for (X, Y, W, H) in kept:
            ix, iy = max(x, X), max(y, Y)
            ax, ay = min(x + w, X + W), min(y + h, Y + H)
            inter = max(0, ax - ix) * max(0, ay - iy)
            if inter and inter / min(w * h, W * H) > iou:
                break
        else:
            kept.append((x, y, w, h))
    return kept


def censor(src, dst):
    img = cv2.imread(str(src))
    if img is None:
        return None
    H, W = img.shape[:2]
    boxes = _merge([b for scale, conf, min_side in PASSES
                    if max(H, W) >= min_side
                    for b in _detect(img, scale, conf)])
    for x, y, w, h in boxes:
        dx, dy = int(w * PAD), int(h * PAD)
        x0, y0 = max(0, x - dx), max(0, y - dy)
        x1, y1 = min(W, x + w + dx), min(H, y + h + dy)
        roi = img[y0:y1, x0:x1]
        if roi.size == 0:
            continue
        # Downscale then nearest-upscale discards the pixels outright. A Gaussian of
        # the wrong radius can be partially undone by sharpening; this cannot.
        small = cv2.resize(roi, (max(1, (x1 - x0) // PIXEL_DIVISOR), max(1, (y1 - y0) // PIXEL_DIVISOR)),
                           interpolation=cv2.INTER_LINEAR)
        img[y0:y1, x0:x1] = cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)
    return boxes if cv2.imwrite(str(dst), img) else None


def main(argv):
    if len(argv) < 2 or len(argv) % 2:
        print(json.dumps({'error': 'expected <in> <out> pairs'}))
        return 2
    if not MODEL.exists():
        print(json.dumps({'error': f'model missing at {MODEL}'}))
        return 3
    results = []
    for src, dst in zip(argv[0::2], argv[1::2]):
        boxes = censor(src, dst)
        # faces = null means the image could not be read or written at all, which is
        # NOT the same as an image with no faces in it. The caller must tell them apart.
        results.append({'in': src, 'out': dst,
                        'faces': None if boxes is None else len(boxes)})
    print(json.dumps({'results': results}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
