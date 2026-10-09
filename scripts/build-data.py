#!/usr/bin/env python3
"""Rebuild public/data from asset/ sources (UTF-8)."""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "data"
BIBLE_OUT = PUBLIC / "bible"
CSV_PATH = ROOT / "asset" / "schedule" / "bible_reading_schedule.csv"
BIBLE_DIR = ROOT / "asset" / "bible" / "개역개정-text"

# CSV abbreviation -> file-internal abbreviation
ALIASES = {
    "라": "스",  # Ezra
    "스": "슥",  # Zechariah
    "나훔": "나",
    "스바냐": "습",
}


def build_schedule() -> None:
    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8"), delimiter=";"))
    schedule = [
        {
            "day": int(r["reading_day"]),
            "weekday": r["weekday"],
            "testament": r["testament"],
            "week": int(r["week_no"]),
            "range": r["reading_range"],
        }
        for r in rows
    ]
    days = [x["day"] for x in schedule]
    if days != list(range(1, 247)):
        raise SystemExit(f"Invalid schedule days: count={len(days)}")
    PUBLIC.mkdir(parents=True, exist_ok=True)
    (PUBLIC / "schedule.json").write_text(
        json.dumps(schedule, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"schedule.json: {len(schedule)} days")


def build_bible() -> None:
    BIBLE_OUT.mkdir(parents=True, exist_ok=True)
    book_meta = []
    for f in sorted(BIBLE_DIR.glob("*.txt")):
        text = f.read_text(encoding="cp949")
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        abbr = None
        for ln in lines:
            m = re.match(r"^([가-힣]+)(\d+):(\d+)\s", ln)
            if m:
                abbr = m.group(1)
                break
        if not abbr:
            print("SKIP", f.name)
            continue
        book: dict[str, dict[str, str]] = {}
        for ln in lines:
            m = re.match(r"^([가-힣]+)(\d+):(\d+)\s+(.*)$", ln)
            if not m:
                continue
            a, ch, vs, body = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
            if a != abbr:
                continue
            book.setdefault(str(ch), {})[str(vs)] = body
        out = {"abbr": abbr, "file": f.name, "chapters": book}
        (BIBLE_OUT / f"{abbr}.json").write_text(
            json.dumps(out, ensure_ascii=False), encoding="utf-8"
        )
        book_meta.append({"abbr": abbr, "file": f.name, "chapterCount": len(book)})

    meta = {"books": book_meta, "aliases": ALIASES}
    (PUBLIC / "books.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"bible books: {len(book_meta)}")


def main() -> None:
    build_schedule()
    build_bible()


if __name__ == "__main__":
    main()
