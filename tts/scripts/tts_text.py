#!/usr/bin/env python3
"""TTS reading-text helpers: strip section titles, chapter announce, day scripts."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from collections.abc import Callable, Iterator

ROOT = Path(__file__).resolve().parents[2]
TTS_ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "data"
SECTION_TITLE_RE = re.compile(r"^<[^>]+>\s*")

# Keep in sync with src/lib/bookNames.ts
BOOK_NAMES: dict[str, str] = {
    "창": "창세기",
    "출": "출애굽기",
    "레": "레위기",
    "민": "민수기",
    "신": "신명기",
    "수": "여호수아",
    "삿": "사사기",
    "룻": "룻기",
    "삼상": "사무엘상",
    "삼하": "사무엘하",
    "왕상": "열왕기상",
    "왕하": "열왕기하",
    "대상": "역대상",
    "대하": "역대하",
    "스": "에스라",
    "라": "에스라",
    "느": "느헤미야",
    "에": "에스더",
    "욥": "욥기",
    "시": "시편",
    "잠": "잠언",
    "전": "전도서",
    "아": "아가",
    "사": "이사야",
    "렘": "예레미야",
    "애": "예레미야애가",
    "겔": "에스겔",
    "단": "다니엘",
    "호": "호세아",
    "욜": "요엘",
    "암": "아모스",
    "옵": "오바댜",
    "욘": "요나",
    "미": "미가",
    "나": "나훔",
    "나훔": "나훔",
    "합": "하박국",
    "습": "스바냐",
    "스바냐": "스바냐",
    "학": "학개",
    "슥": "스가랴",
    "말": "말라기",
    "마": "마태복음",
    "막": "마가복음",
    "눅": "누가복음",
    "요": "요한복음",
    "행": "사도행전",
    "롬": "로마서",
    "고전": "고린도전서",
    "고후": "고린도후서",
    "갈": "갈라디아서",
    "엡": "에베소서",
    "빌": "빌립보서",
    "골": "골로새서",
    "살전": "데살로니가전서",
    "살후": "데살로니가후서",
    "딤전": "디모데전서",
    "딤후": "디모데후서",
    "딛": "디도서",
    "몬": "빌레몬서",
    "히": "히브리서",
    "약": "야고보서",
    "벧전": "베드로전서",
    "벧후": "베드로후서",
    "요일": "요한일서",
    "요이": "요한이서",
    "요삼": "요한삼서",
    "유": "유다서",
    "계": "요한계시록",
}


@dataclass
class RangeSegment:
    abbr: str
    start_chapter: int
    start_verse: int | None
    end_chapter: int
    end_verse: int | None


def strip_section_title(text: str) -> str:
    """Remove leading <단락 제목> markers from verse text for TTS."""
    return SECTION_TITLE_RE.sub("", text or "").strip()


def get_book_name(abbr: str) -> str:
    return BOOK_NAMES.get(abbr, abbr)


_KO_DIGITS = ("", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구")


def korean_number(n: int) -> str:
    """Convert 1..199 to Sino-Korean reading words (for chapter announce TTS)."""
    if n < 1 or n > 199:
        raise ValueError(f"chapter number out of range: {n}")
    if n < 10:
        return _KO_DIGITS[n]
    if n < 20:
        return "십" if n == 10 else f"십{_KO_DIGITS[n % 10]}"
    if n < 100:
        tens, ones = divmod(n, 10)
        head = f"{_KO_DIGITS[tens]}십"
        return head if ones == 0 else f"{head}{_KO_DIGITS[ones]}"
    # 100–199
    rest = n - 100
    if rest == 0:
        return "백"
    return f"백{korean_number(rest)}"


def chapter_announce(abbr: str, chapter: int) -> str:
    """Spoken chapter cue for Supertonic.

    Digit-only short cues (``창세기 1장``) often glitch. Hangul numerals in a
    short sentence work better.

    Example: 창/1 → ``창세기 일장 말씀입니다.``
    """
    return f"{get_book_name(abbr)} {korean_number(chapter)}장 말씀입니다."


def build_chapter_script(abbr: str, chapter: int, verse_texts: list[str]) -> str:
    """Full chapter text for preview/debug. Day generation synthesizes announce separately."""
    parts = [chapter_announce(abbr, chapter)]
    for raw in verse_texts:
        cleaned = strip_section_title(raw)
        if cleaned:
            parts.append(cleaned)
    return " ".join(parts)


def build_chapter_body(verse_texts: list[str]) -> str:
    """Body-only script (no chapter announce) for separated announce + silence synthesis."""
    parts: list[str] = []
    for raw in verse_texts:
        cleaned = strip_section_title(raw)
        if cleaned:
            parts.append(cleaned)
    return " ".join(parts)


def parse_reading_range(range_str: str) -> list[RangeSegment]:
    """Port of src/lib/rangeParser.ts (essential patterns)."""
    parts = [p.strip() for p in range_str.split(",") if p.strip()]
    segments: list[RangeSegment] = []

    for part in parts:
        if "·" in part:
            m = re.match(r"^([가-힣]+)(.+)$", part)
            if not m:
                continue
            abbr, rest = m.group(1), m.group(2)
            rest = rest.replace("편", "").replace("장", "")
            for piece in rest.split("·"):
                token = piece.strip()
                if not token:
                    continue
                if "-" in token:
                    a, b = token.split("-", 1)
                    segments.append(
                        RangeSegment(abbr, int(a), None, int(b), None)
                    )
                else:
                    n = int(token)
                    segments.append(RangeSegment(abbr, n, None, n, None))
            continue

        patterns: list[tuple[re.Pattern[str], Callable[[re.Match[str]], RangeSegment]]] = [
            (
                re.compile(r"^([가-힣]+)(\d+):(\d+)-(\d+):(\d+)$"),
                lambda m: RangeSegment(
                    m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5))
                ),
            ),
            (
                re.compile(r"^([가-힣]+)(\d+)장-(\d+):(\d+)$"),
                lambda m: RangeSegment(
                    m.group(1), int(m.group(2)), None, int(m.group(3)), int(m.group(4))
                ),
            ),
            (
                re.compile(r"^([가-힣]+)(\d+):(\d+)-(\d+)장$"),
                lambda m: RangeSegment(
                    m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4)), None
                ),
            ),
            (
                re.compile(r"^([가-힣]+)(\d+)-(\d+):(\d+)$"),
                lambda m: RangeSegment(
                    m.group(1), int(m.group(2)), None, int(m.group(3)), int(m.group(4))
                ),
            ),
            (
                re.compile(r"^([가-힣]+)(\d+):(\d+)-(\d+)$"),
                lambda m: RangeSegment(
                    m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(2)), int(m.group(4))
                ),
            ),
            (
                re.compile(r"^([가-힣]+)(\d+):(\d+)$"),
                lambda m: RangeSegment(
                    m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(2)), int(m.group(3))
                ),
            ),
            (
                re.compile(r"^([가-힣]+)(\d+)-(\d+)(?:장|편)?$"),
                lambda m: RangeSegment(
                    m.group(1), int(m.group(2)), None, int(m.group(3)), None
                ),
            ),
            (
                re.compile(r"^([가-힣]+)(\d+)(?:장|편)?$"),
                lambda m: RangeSegment(
                    m.group(1), int(m.group(2)), None, int(m.group(2)), None
                ),
            ),
        ]
        for pat, mapper in patterns:
            m = pat.match(part)
            if m:
                segments.append(mapper(m))
                break

    return segments


def _load_aliases() -> dict[str, str]:
    meta = json.loads((PUBLIC / "books.json").read_text(encoding="utf-8"))
    return dict(meta.get("aliases") or {})


def _load_book(translation_id: str, abbr: str) -> dict | None:
    path = PUBLIC / "bible" / translation_id / f"{abbr}.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _verses_from_segment(book: dict, seg: RangeSegment) -> Iterator[tuple[int, int, str]]:
    for ch in range(seg.start_chapter, seg.end_chapter + 1):
        chapter = book.get("chapters", {}).get(str(ch))
        if not chapter:
            continue
        verse_nums = sorted(int(v) for v in chapter if v.isdigit())
        for v in verse_nums:
            if ch == seg.start_chapter and seg.start_verse is not None and v < seg.start_verse:
                continue
            if ch == seg.end_chapter and seg.end_verse is not None and v > seg.end_verse:
                continue
            yield ch, v, chapter[str(v)]


def build_day_script(
    day: int,
    *,
    translation_id: str = "krv",
) -> dict:
    """
    Build TTS script for one schedule day.
    Returns { day, range, chapters: [{abbr, chapter, announce, text, verseCount}], fullText }.
    """
    schedule = json.loads((PUBLIC / "schedule.json").read_text(encoding="utf-8"))
    item = next((x for x in schedule if x["day"] == day), None)
    if not item:
        raise ValueError(f"Unknown day: {day}")

    aliases = _load_aliases()
    segments = parse_reading_range(item["range"])
    chapter_blocks: list[dict] = []
    current_key: tuple[str, int] | None = None
    current_verses: list[str] = []

    def flush() -> None:
        nonlocal current_key, current_verses
        if current_key is None:
            return
        abbr, ch = current_key
        script = build_chapter_script(abbr, ch, current_verses)
        chapter_blocks.append(
            {
                "abbr": abbr,
                "chapter": ch,
                "announce": chapter_announce(abbr, ch),
                "text": script,
                "verseCount": len(current_verses),
            }
        )
        current_key = None
        current_verses = []

    for seg in segments:
        file_abbr = aliases.get(seg.abbr, seg.abbr)
        book = _load_book(translation_id, file_abbr)
        if not book:
            continue
        for ch, _v, text in _verses_from_segment(
            book,
            RangeSegment(file_abbr, seg.start_chapter, seg.start_verse, seg.end_chapter, seg.end_verse),
        ):
            key = (file_abbr, ch)
            if current_key != key:
                flush()
                current_key = key
            current_verses.append(text)
    flush()

    full = " ".join(block["text"] for block in chapter_blocks)
    return {
        "day": day,
        "range": item["range"],
        "translationId": translation_id,
        "chapters": chapter_blocks,
        "fullText": full,
    }


def sample_genesis_script() -> str:
    """Short sample with chapter announce + stripped titles (창 1:1-3)."""
    book = _load_book("krv", "창")
    if not book:
        raise FileNotFoundError("krv/창.json missing — run npm run data")
    ch1 = book["chapters"]["1"]
    verses = [ch1[str(i)] for i in (1, 2, 3)]
    return build_chapter_script("창", 1, verses)


if __name__ == "__main__":
    # quick self-check
    assert strip_section_title("<천지 창조> 태초에 하나님이") == "태초에 하나님이"
    assert korean_number(1) == "일"
    assert korean_number(20) == "이십"
    assert korean_number(119) == "백십구"
    assert chapter_announce("요", 20) == "요한복음 이십장 말씀입니다."
    s = sample_genesis_script()
    assert s.startswith("창세기 일장 말씀입니다.")
    assert "<" not in s
    print("ok:", s[:120], "...")
    day1 = build_day_script(1)
    print(f"day1 chapters={len(day1['chapters'])} chars={len(day1['fullText'])}")
    print("day1 starts:", day1["fullText"][:80])
