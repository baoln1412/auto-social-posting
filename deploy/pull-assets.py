#!/usr/bin/env python3
"""Pull CC0 assets into the shipped pack, with a licence recorded for every file.

Only CC0. Not "free", not "free with credit" — CC0. The page is monetised, so BY-NC is
barred outright and BY means a credit line in every description, which an automated
pipeline will eventually drop and then we are in breach at scale rather than once.

Measured while choosing the source (2026-10-10):
  Jamendo      644,708 tracks, exactly 0 under CC0 — all by / by-sa / by-nc
  Openverse    category=music + cc0 -> 0; searching around it reaches single digits
  Pixabay      best licence of any of them, but the API serves images and video only
  Freesound    hundreds of thousands of CC0 clips, reachable through Openverse with no key
So SFX and backgrounds come down automatically; music beds stay a hand-picked drop.

Every file written here gets a row in licences.json keyed by "<kind>/<filename>", and
lib/studio/assets.ts SKIPS any file without one — an asset nobody can name the licence of
never reaches a video.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, "deploy", "assets", "media")
API = "https://api.openverse.org/v1"
UA = {"User-Agent": "desoul-studio/1.0 (+https://desoul.dev)"}

PLAN = {
    "sfx": [("whoosh transition", 6), ("swoosh", 4), ("impact hit", 4),
            ("notification pop", 3), ("camera shutter", 2), ("page turn", 2)],
    "bg": [("sydney australia", 3), ("melbourne city", 2), ("london street", 2),
           ("vietnam hanoi", 3), ("office desk documents", 3), ("airport terminal", 2),
           ("passport document", 2)],
}
MAX_BYTES = 6 * 1024 * 1024


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45).read()


def search(kind, q, n):
    media = "audio" if kind == "sfx" else "images"
    qs = urllib.parse.urlencode({"license": "cc0", "q": q, "page_size": max(n * 3, 8)})
    try:
        return json.loads(get(f"{API}/{media}/?{qs}")).get("results") or []
    except Exception as e:
        print(f"    search failed ({e})")
        return []


def slug(s, fallback):
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:48]
    return s or fallback


def main():
    manifest_path = os.path.join(PACK, "licences.json")
    try:
        manifest = json.load(open(manifest_path, encoding="utf-8"))
    except Exception:
        manifest = {}

    for kind, queries in PLAN.items():
        out = os.path.join(PACK, kind)
        os.makedirs(out, exist_ok=True)
        for q, want in queries:
            print(f"  {kind}: {q!r}")
            kept = 0
            for r in search(kind, q, want):
                if kept >= want:
                    break
                url = r.get("url")
                if not url:
                    continue
                ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
                if ext not in (".mp3", ".wav", ".ogg", ".flac", ".jpg", ".jpeg", ".png", ".webp"):
                    ext = ".mp3" if kind == "sfx" else ".jpg"
                name = f"{slug(r.get('title'), r.get('id', 'asset'))}{ext}"
                rel = f"{kind}/{name}"
                if rel in manifest:
                    continue
                try:
                    data = get(url)
                except Exception:
                    continue
                if not data or len(data) > MAX_BYTES:
                    continue
                open(os.path.join(out, name), "wb").write(data)
                manifest[rel] = {
                    "source": r.get("foreign_landing_url") or url,
                    "licence": f"{r.get('license')}-{r.get('license_version') or ''}".strip("-"),
                    "title": (r.get("title") or name)[:80],
                    "creator": r.get("creator") or "",
                    "provider": r.get("provider") or "",
                }
                kept += 1
                print(f"    + {name} ({len(data)//1024} KB)")
                time.sleep(0.3)

    os.makedirs(PACK, exist_ok=True)
    json.dump(manifest, open(manifest_path, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2, sort_keys=True)
    by_kind = {}
    for rel in manifest:
        by_kind[rel.split("/")[0]] = by_kind.get(rel.split("/")[0], 0) + 1
    print(f"\nmanifest: {len(manifest)} files  {by_kind}")
    bad = [k for k, v in manifest.items() if not str(v.get('licence', '')).startswith('cc0')]
    if bad:
        print(f"NOT CC0 ({len(bad)}): {bad[:5]}")
        return 1
    print("every file is cc0")


if __name__ == "__main__":
    sys.exit(main() or 0)
