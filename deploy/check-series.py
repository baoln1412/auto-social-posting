#!/usr/bin/env python3
"""Check a crime-series POST payload against CRIME_SOP.md and report every problem at once.

Usage:  python3 deploy/check-series.py payload.json
Exit 0 = clean, 1 = problems found (printed one per line, most severe first).

Why this exists, measured on a real run: writing one series cost ~32,700 output tokens over
72 API turns, and the breakdown was 4 Write calls (26,600 tokens), 17 Edit calls (11,700) and
38 Bash calls (9,200) - against roughly 13,000 tokens of actual published content. Most of
that was the model checking its own work by hand, one property at a time, and re-emitting
whole instalments to fix each one it found.

A deterministic checker turns that loop into: compose once, run this, fix exactly what it
lists, POST. The model never spends tokens rediscovering a rule it already has.

Deliberately NOT a gate that rewrites anything. It reports; the writer decides.
"""
import json
import re
import sys

MIN_WORDS = 3000            # §10, per kỳ, never the total across three
TITLE_WORDS = (12, 14)      # §4
COMMENTS = 3                # §7

# §3a. Direct terms that must be converted, in prose AND in titles.
BANNED = ['bắn chết', 'sát hại', 'xác chết', 'tử thi', 'vũng máu', 'máu me',
          'hiếp dâm', 'xâm hại tình dục', 'xâm hại', 'tự tử', 'tự sát', 'chặt xác']

# "giết" is handled separately and NARROWLY, because §3a exempts charge names and the
# language of criminal law is full of them: "tội giết người", "ý định giết người", "giết
# nhiều nạn nhân", "giết cảnh sát đang thi hành công vụ" are all legally correct and must
# not be flagged. A first version matched the bare word and produced four false alarms on a
# published series - a checker that cries wolf gets ignored, which is worse than no checker.
#
# So match only the forms that are NARRATION of the act, which are the ones actually found
# and fixed by hand: "giết chết", "bị giết", "giết N mạng".
GIET_NARRATIVE = re.compile(r'giết\s+chết|\bbị\s+giết\b|giết\s+(?:\d+|một|hai|ba|bốn|năm)\s+mạng', re.I)

# Same exemption, different word: "sát hại nhiều nạn nhân" is California's multiple-murder
# special circumstance, i.e. the NAME of an aggravating finding, not a description of the act.
LEGAL_PHRASE = re.compile(r'(?:tình tiết|việc|tội danh|định khung|tăng nặng)[^.]{0,40}sát hại nhiều nạn nhân', re.I)

def words(t):
    return len([w for w in re.split(r'\s+', (t or '').strip()) if w])

def title_words(t):
    # Strip the emoji and the "KỲ N:" marker; neither is part of the headline being counted.
    t = re.sub(r'^\W*(?:KỲ\s+[IVX]+(?:\s*\(KỲ CUỐI\))?\s*:)?\s*', '', t or '', flags=re.I)
    t = re.sub(r'^[^\wÀ-ỹ]+', '', t)
    return words(t)


def check(payload):
    p = []
    parts = sorted(payload.get('parts') or [], key=lambda x: x.get('part_no', 0))
    st = (payload.get('seriesTitle') or '').strip()

    if not st:
        p.append('FATAL seriesTitle trống')
    elif not (TITLE_WORDS[0] <= title_words(st) <= TITLE_WORDS[1]):
        p.append(f'§4  tiêu đề đại án {title_words(st)} từ, cần {TITLE_WORDS[0]}-{TITLE_WORDS[1]}: {st[:60]}')
    if st and not st.lstrip().startswith('🩸'):
        p.append('§4  tiêu đề đại án phải mở đầu bằng 🩸')
    if st and st != st.upper():
        p.append('§4  tiêu đề đại án phải VIẾT HOA toàn bộ')

    # §3a's table says "applies to narration AND to titles" - the overall series title
    # is a title too, and was missing from this check entirely until a run through
    # fix-series.py caught a violation here that this script had never once flagged.
    for term in BANNED:
        for m in re.finditer(re.escape(term), st, re.I):
            ctx = st[max(0, m.start() - 45):m.end() + 45]
            if LEGAL_PHRASE.search(ctx):
                continue
            p.append(f'§3a tiêu đề đại án: "{term}" chưa quy đổi — …{ctx.strip()[:90]}…')
    for m in GIET_NARRATIVE.finditer(st):
        p.append(f'§3a tiêu đề đại án: "{m.group(0)}" là lời tường thuật, phải quy đổi')

    if len(parts) != 3:
        p.append(f'§8  có {len(parts)} kỳ, cần đúng 3')

    for part in parts:
        n = part.get('part_no', '?')
        body = part.get('body_text') or ''
        et = part.get('emoji_title') or ''
        w = words(body)
        if w < MIN_WORDS:
            p.append(f'§10 KỲ {n} chỉ {w:,} từ, cần ≥{MIN_WORDS:,} — viết sâu thêm CHÍNH KỲ NÀY, không bù bằng kỳ khác')
        if not (TITLE_WORDS[0] <= title_words(et) <= TITLE_WORDS[1]):
            p.append(f'§4  KỲ {n} tiêu đề {title_words(et)} từ, cần {TITLE_WORDS[0]}-{TITLE_WORDS[1]}')
        if et and et != et.upper():
            p.append(f'§4  KỲ {n} tiêu đề phải VIẾT HOA')

        for ch in ('—', '–'):
            if ch in body:
                p.append(f'§10 KỲ {n} còn {body.count(ch)} dấu gạch ngang dài "{ch}"')

        # §3a applies to the title as well, which is the place it gets forgotten.
        for field, text in (('thân bài', body), ('tiêu đề', et)):
            for term in BANNED:
                for m in re.finditer(re.escape(term), text, re.I):
                    ctx = text[max(0, m.start() - 45):m.end() + 45].replace('\n', ' ')
                    if LEGAL_PHRASE.search(ctx):
                        continue
                    p.append(f'§3a KỲ {n} {field}: "{term}" chưa quy đổi — …{ctx.strip()[:90]}…')
            for m in GIET_NARRATIVE.finditer(text):
                ctx = text[max(0, m.start() - 45):m.end() + 45].replace('\n', ' ')
                p.append(f'§3a KỲ {n} {field}: "{m.group(0)}" là lời tường thuật, phải quy đổi — …{ctx.strip()[:90]}…')

        head = [l for l in body.split('\n') if l.strip()][:2]
        if len(head) < 2 or st[:14].upper() not in head[0].upper():
            p.append(f'§1  KỲ {n} hai dòng đầu thân bài phải là tiêu đề đại án rồi tiêu đề kỳ')

        got = sum(1 for k in ('comment_1', 'comment_2', 'comment_3') if (part.get(k) or '').strip())
        if got < COMMENTS:
            p.append(f'§7  KỲ {n} mới có {got}/{COMMENTS} comment')

        if 'Lưu ý biên tập' in body or 'lưu ý biên tập' in body:
            p.append(f'§10 KỲ {n} còn ghi chú biên tập trong thân bài — chuyển sang summary')


    for f in ('victimName', 'suspectName', 'stateName'):
        if f not in payload:
            p.append(f'§8a thiếu trường {f} (để chuỗi rỗng nếu hồ sơ không nêu)')
    return p


def main(argv):
    if len(argv) != 1:
        print('usage: check-series.py payload.json'); return 2
    try:
        payload = json.loads(open(argv[0], encoding='utf-8').read())
    except Exception as e:
        print(f'FATAL không đọc được payload: {e}'); return 2
    problems = check(payload)
    if not problems:
        parts = payload.get('parts') or []
        print(f'OK — {len(parts)} kỳ: ' + ', '.join(f'{words(p.get("body_text")):,} từ' for p in parts))
        return 0
    print(f'{len(problems)} vấn đề cần sửa:')
    for x in problems:
        print(f'  - {x}')
    return 1


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
