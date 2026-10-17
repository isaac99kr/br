#!/usr/bin/env python3
"""Compare legacy and current schedule readings by resolved verse order."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "tts" / "scripts"
sys.path.insert(0, str(SCRIPTS))

from tts_text import (  # noqa: E402
    RangeSegment,
    _load_aliases,
    _load_book,
    _verses_from_segment,
    parse_reading_range,
)

BASELINE_COMMIT = "5355cff"
DAYS = range(220, 247)


def load_baseline() -> list[dict]:
    result = subprocess.run(
        ["git", "show", f"{BASELINE_COMMIT}:public/data/schedule.json"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def resolve_verse_ids(reading_range: str) -> list[tuple[str, int, int]]:
    aliases = _load_aliases()
    ids: list[tuple[str, int, int]] = []
    for segment in parse_reading_range(reading_range):
        abbr = aliases.get(segment.abbr, segment.abbr)
        book = _load_book("krv", abbr)
        if not book:
            raise ValueError(f"book not found: {abbr}")
        resolved = RangeSegment(
            abbr,
            segment.start_chapter,
            segment.start_verse,
            segment.end_chapter,
            segment.end_verse,
        )
        ids.extend((abbr, chapter, verse) for chapter, verse, _ in _verses_from_segment(book, resolved))
    return ids


def main() -> None:
    old = {item["day"]: item["range"] for item in load_baseline()}
    current_data = json.loads((ROOT / "public" / "data" / "schedule.json").read_text(encoding="utf-8"))
    current = {item["day"]: item["range"] for item in current_data}
    changed: list[int] = []

    for day in DAYS:
        before = resolve_verse_ids(old[day])
        after = resolve_verse_ids(current[day])
        if before != after:
            changed.append(day)
            print(f"day {day}: {len(before)} verses → {len(after)} verses")

    expected = [223, 224, 226, 229, 235, 236]
    if changed != expected:
        raise SystemExit(f"unexpected regeneration set: {changed}; expected {expected}")
    print(f"OK: regenerate only {', '.join(map(str, changed))}")


if __name__ == "__main__":
    main()
