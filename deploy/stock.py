#!/usr/bin/env python3
"""Keyword -> stock b-roll, so a reel can be built for an abstract topic that owns no picture.
make-reel.py's media only ever came from the post itself (article.imageUrl / an explicit `media`
list); an English "AI x money" script about, say, interest rates has no such image. This fills that
one gap — the single transferable part of MoneyPrinterTurbo. Free Pexels key, stdlib only.

Emits exactly make-reel.py's media shape: [{"url","kind"}], so the output pastes straight into a
--json payload's "media" field.

Usage: PEXELS_API_KEY=... stock.py "ai investing" [count] [--photos]
       stock.py "1950s wall street" 3 --archive   # Internet Archive, no key at all
       stock.py --demo                            # offline self-check, no key needed
"""
import json, os, sys, urllib.parse, urllib.request

API = "https://api.pexels.com"
TARGET_W = 1080          # the reel crops to 1080x1920; a 4K file is just a slower download


def _get(path, params, key):
    req = urllib.request.Request(f"{API}{path}?{urllib.parse.urlencode(params)}",
                                 headers={"Authorization": key})
    return json.load(urllib.request.urlopen(req, timeout=25))


def pick_file(files, target_w=TARGET_W):
    """Cheapest file that still covers the crop: prefer portrait, then width closest to 1080 from
    above (upscaling a 640px clip to 1080 looks soft, so never fall below the target if anything
    clears it)."""
    usable = [f for f in files if f.get("link") and f.get("width") and f.get("height")]
    if not usable:
        return None
    big = [f for f in usable if f["width"] >= target_w] or usable
    return min(big, key=lambda f: (f["width"] < f["height"] and 0 or 1, abs(f["width"] - target_w)))


def search_archive(query, count=3):
    """Public-domain motion footage from the Internet Archive — no key at all (unlike Pexels), and
    real footage rather than stock b-roll, which is the difference between a video that looks
    researched and one that looks generic. The free-archive path from OpenMontage."""
    q = urllib.parse.urlencode({"q": f"{query} AND mediatype:(movies)", "rows": max(1, count) * 2,
                                "page": 1, "output": "json"}) + "&fl%5B%5D=identifier"
    docs = json.load(urllib.request.urlopen(
        f"https://archive.org/advancedsearch.php?{q}", timeout=25)).get("response", {}).get("docs", [])
    out = []
    for doc in docs:
        if len(out) >= count:
            break
        ident = doc.get("identifier")
        try:
            meta = json.load(urllib.request.urlopen(f"https://archive.org/metadata/{ident}", timeout=25))
        except Exception:
            continue
        mp4 = next((f["name"] for f in meta.get("files", []) if f.get("name", "").lower().endswith(".mp4")), None)
        if mp4:
            out.append({"url": f"https://archive.org/download/{ident}/{urllib.parse.quote(mp4)}",
                        "kind": "video"})
    return out


def search(query, count=3, kind="video", key=None, source="pexels"):
    """[{"url","kind"}] for `query`. kind='video' (b-roll, preferred) or 'photo' (Ken Burns).
    source='archive' uses the Internet Archive instead and needs no key."""
    if source == "archive":
        return search_archive(query, count)
    key = key or os.environ.get("PEXELS_API_KEY")
    if not key:
        raise SystemExit("set PEXELS_API_KEY (free: https://www.pexels.com/api/)")
    params = {"query": query, "per_page": max(1, count), "orientation": "portrait"}
    if kind == "video":
        data = _get("/videos/search", params, key)
        out = []
        for v in data.get("videos", []):
            f = pick_file(v.get("video_files", []))
            if f:
                out.append({"url": f["link"], "kind": "video"})
        return out[:count]
    data = _get("/v1/search", params, key)
    return [{"url": p["src"]["large2x"], "kind": "image"}
            for p in data.get("photos", []) if p.get("src", {}).get("large2x")][:count]


def demo():
    files = [{"link": "a", "width": 640, "height": 1138}, {"link": "b", "width": 1080, "height": 1920},
             {"link": "c", "width": 2160, "height": 3840}]
    assert pick_file(files)["link"] == "b", "should take the smallest file that still covers 1080"
    assert pick_file([{"link": "a", "width": 640, "height": 1138}])["link"] == "a", "nothing clears it -> best available"
    assert pick_file([]) is None
    landscape = [{"link": "wide", "width": 1920, "height": 1080}, {"link": "tall", "width": 1080, "height": 1920}]
    assert pick_file(landscape)["link"] == "tall", "portrait wins for a 9:16 reel"
    print("stock.py self-check ok")


if __name__ == "__main__":
    if "--demo" in sys.argv:
        demo(); sys.exit(0)
    q = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 3
    print(json.dumps(search(q, n, "photo" if "--photos" in sys.argv else "video",
                            source="archive" if "--archive" in sys.argv else "pexels"), indent=2))
