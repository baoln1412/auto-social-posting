#!/usr/bin/env python3
"""Auto-apply the MECHANICAL fixes check-series.py finds, in place.

Usage:  python3 deploy/fix-series.py payload.json
Prints what it changed, one line per fix, then exits 0.

Handles only what's genuinely deterministic - no rewriting, no invented content:
  - §3a banned-word substitution, using the SAME detection regexes check-series.py
    uses (including the "tội giết người" / "sát hại nhiều nạn nhân" legal-phrase
    exemption), so nothing this fixer touches is something the checker wouldn't
    also have flagged.
  - Em dash / en dash -> comma.
  - Missing 🩸 prefix / non-uppercase on seriesTitle and each emoji_title.
  - Missing two-line body header -> prepended from seriesTitle + emoji_title.
  - Missing §8a identity fields -> defaulted to ''.

Deliberately does NOT touch: word counts, missing episodes, missing comments,
editorial-note leakage. Those need a rewrite, not a substitution - run
check-series.py after this and read judgement into whatever it still lists.
"""
import json
import re
import sys

# Mirrors check-series.py exactly - kept in sync deliberately, not imported,
# since this file has zero other dependency on that one and a shared import
# would couple two scripts that fail independently (one reports, one edits).
BANNED = ['bắn chết', 'sát hại', 'xác chết', 'tử thi', 'vũng máu', 'máu me',
          'hiếp dâm', 'xâm hại tình dục', 'xâm hại', 'tự tử', 'tự sát', 'chặt xác']
GIET_NARRATIVE = re.compile(r'giết\s+chết|\bbị\s+giết\b|giết\s+(?:\d+|một|hai|ba|bốn|năm)\s+mạng', re.I)
LEGAL_PHRASE = re.compile(r'(?:tình tiết|việc|tội danh|định khung|tăng nặng)[^.]{0,40}sát hại nhiều nạn nhân', re.I)

# §3a's own table. First listed alternative each, so output is deterministic
# and a human re-reading a case knows what to expect rather than guessing which
# synonym got picked.
REPLACEMENTS = {
    'bắn chết': 'hạ sát', 'sát hại': 'hạ sát',
    'xác chết': 'thi thể', 'tử thi': 'thi thể',
    'vũng máu': 'vết tích đông cứng', 'máu me': 'vết tích đông cứng',
    'hiếp dâm': 'hành vi đồi bại', 'xâm hại tình dục': 'hành vi đồi bại', 'xâm hại': 'hành vi đồi bại',
    'tự tử': 'tự kết thúc cuộc đời', 'tự sát': 'tự kết thúc cuộc đời',
    'chặt xác': 'phân tách thân thể',
}
# Longest-first, so "xâm hại tình dục" is substituted whole before the bare
# "xâm hại" pattern can match inside it and leave a mangled half-replacement.
BANNED_LONGEST_FIRST = sorted(BANNED, key=len, reverse=True)


def match_case(replacement, original):
    """Preserve the matched text's case - titles are VIẾT HOA, body prose isn't."""
    if original.isupper():
        return replacement.upper()
    if original[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def fix_giet(m):
    txt = m.group(0)
    low = txt.lower()
    if low.startswith('giết chết'):
        return match_case('hạ sát', txt)
    if low.startswith('bị giết'):
        return match_case('bị hạ sát', txt)
    mm = re.match(r'giết\s+(\d+|một|hai|ba|bốn|năm)\s+mạng', txt, re.I)
    if mm:
        return match_case(f'đoạt mạng {mm.group(1)} người', txt)
    return txt  # shouldn't happen - the compiled pattern only has these 3 shapes


def fix_text(text, changes, where):
    if not text:
        return text
    for ch in ('—', '–'):
        n = text.count(ch)
        if n:
            text = text.replace(ch, ',')
            changes.append(f'{where}: {n}x dấu gạch ngang dài "{ch}" -> dấu phẩy')

    for term in BANNED_LONGEST_FIRST:
        def sub(m, term=term):
            ctx = text[max(0, m.start() - 45):m.end() + 45]
            if LEGAL_PHRASE.search(ctx):
                return m.group(0)  # legal term, e.g. "tội danh sát hại nhiều nạn nhân" - leave it
            changes.append(f'{where}: "{m.group(0)}" -> "{match_case(REPLACEMENTS[term], m.group(0))}"')
            return match_case(REPLACEMENTS[term], m.group(0))
        text = re.sub(re.escape(term), sub, text, flags=re.I)

    def sub_giet(m):
        fixed = fix_giet(m)
        if fixed != m.group(0):
            changes.append(f'{where}: "{m.group(0)}" -> "{fixed}"')
        return fixed
    text = GIET_NARRATIVE.sub(sub_giet, text)
    return text


def fix_title(text, changes, where, require_flag=False):
    if not text:
        return text
    fixed = text
    if require_flag and not fixed.lstrip().startswith('🩸'):
        fixed = '🩸 ' + fixed.lstrip()
        changes.append(f'{where}: thêm 🩸 vào đầu')
    if fixed != fixed.upper():
        fixed = fixed.upper()
        changes.append(f'{where}: chuyển VIẾT HOA toàn bộ')
    return fixed


def fix(payload, changes):
    st = fix_title((payload.get('seriesTitle') or '').strip(), changes, 'seriesTitle', require_flag=True)
    st = fix_text(st, changes, 'seriesTitle')
    payload['seriesTitle'] = st

    for f in ('victimName', 'suspectName', 'stateName'):
        if f not in payload:
            payload[f] = ''
            changes.append(f'§8a: thêm trường {f} rỗng')

    for part in (payload.get('parts') or []):
        n = part.get('part_no', '?')
        et = fix_title((part.get('emoji_title') or ''), changes, f'KỲ {n} tiêu đề')
        et = fix_text(et, changes, f'KỲ {n} tiêu đề')
        part['emoji_title'] = et

        body = fix_text(part.get('body_text') or '', changes, f'KỲ {n} thân bài')
        head = [l for l in body.split('\n') if l.strip()][:2]
        if len(head) < 2 or st[:14].upper() not in head[0].upper():
            body = f'{st}\n{et}\n\n{body.lstrip()}'
            changes.append(f'KỲ {n}: chèn lại hai dòng tiêu đề đầu thân bài')
        part['body_text'] = body
    return payload


def main(argv):
    if len(argv) != 1:
        print('usage: fix-series.py payload.json'); return 2
    path = argv[0]
    try:
        payload = json.loads(open(path, encoding='utf-8').read())
    except Exception as e:
        print(f'FATAL không đọc được payload: {e}'); return 2

    changes = []
    payload = fix(payload, changes)

    if not changes:
        print('Không có gì để sửa tự động.')
        return 0

    open(path, 'w', encoding='utf-8').write(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f'Đã sửa {len(changes)} chỗ:')
    for c in changes:
        print(f'  - {c}')
    print('\nChạy lại check-series.py để xem còn gì cần tự viết lại.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
