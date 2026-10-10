#!/usr/bin/env python3
"""Rebuild public/data from asset/ sources (UTF-8)."""
from __future__ import annotations

import csv
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "data"
BIBLE_OUT = PUBLIC / "bible"
SCHEDULE_DIR = ROOT / "asset" / "schedule"
KRV_DIR = ROOT / "asset" / "bible" / "개역개정-text"
RNKSV_PATH = ROOT / "asset" / "bible" / "표준새번역개정판.txt"

# CSV abbreviation -> file-internal abbreviation
ALIASES = {
    "라": "스",  # Ezra (chrono schedule)
    "나훔": "나",
    "스바냐": "습",
}

# Registry of reading schedules. Add a CSV + entry here to ship a new plan.
SCHEDULES = [
    {
        "id": "chrono-246",
        "title": "연대기순 246일",
        "description": "구약·신약 연대기 순서 통독",
        "dayCount": 246,
        "groupMode": "testament-week",
        "csv": "chrono-246.csv",
        "default": True,
    },
    {
        "id": "yearly-365",
        "title": "1년 1독",
        "description": "날짜별 통독표 (1월 1일~12월 31일)",
        "dayCount": 365,
        "groupMode": "month",
        "csv": "yearly-365.csv",
        "source": "성서유니온 일년일독 통독표",
        "default": False,
    },
    {
        "id": "mcheyne-365",
        "title": "맥체인",
        "description": "로버트 머레이 맥체인 1년 4본문 통독표",
        "dayCount": 365,
        "groupMode": "month",
        "csv": "mcheyne-365.csv",
        "source": "맥체인 성경 읽기표",
        "default": False,
    },
]

TRANSLATIONS = [
    {
        "id": "krv",
        "label": "개역개정",
        "shortLabel": "개역",
        "default": True,
    },
    {
        "id": "rnksv",
        "label": "표준새번역",
        "shortLabel": "표준",
        "default": False,
    },
]

KRV_VERSE_RE = re.compile(r"^([가-힣]+)(\d+):(\d+)\s+(.*)$")
RNKSV_BOOK_RE = re.compile(r"^(\d{2})\s+0:0\s+([^,]+),([^,]+),(\d+)\s*$")
RNKSV_VERSE_RE = re.compile(r"^(\d{2})\s+(\d+):(\d+)\s+(.*)$")
FOOTNOTE_PAREN_RE = re.compile(r"\([a-z]\s[^)]*\)")
FOOTNOTE_MARKER_RE = re.compile(r"(?<![A-Za-z])[a-z](?=[가-힣〈<\u3008\"'“‘])")

# RNKSV book headers use different short names for a few books; normalize to KRV/file abbrs
# so both translations share the same {abbr}.json filenames (and CSV aliases).
RNKSV_ABBR_NORMALIZE = {
    "라": "스",  # Ezra
    "더": "에",  # Esther
}


def write_json(path: Path, data: object, *, indent: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=indent),
        encoding="utf-8",
    )


def _optional_int(row: dict[str, str], key: str) -> int | None:
    raw = (row.get(key) or "").strip()
    if not raw:
        return None
    return int(raw)


def _optional_str(row: dict[str, str], key: str) -> str | None:
    raw = (row.get(key) or "").strip()
    return raw or None


def build_one_schedule(spec: dict) -> list[dict]:
    csv_path = SCHEDULE_DIR / spec["csv"]
    if not csv_path.is_file():
        raise SystemExit(f"Missing schedule CSV: {csv_path}")

    rows = list(csv.DictReader(csv_path.open(encoding="utf-8"), delimiter=";"))
    schedule: list[dict] = []
    for r in rows:
        item: dict = {
            "day": int(r["reading_day"]),
            "range": r["reading_range"].strip(),
        }
        weekday = _optional_str(r, "weekday")
        if weekday is not None:
            item["weekday"] = weekday
        testament = _optional_str(r, "testament")
        if testament is not None:
            item["testament"] = testament
        week = _optional_int(r, "week_no")
        if week is not None:
            item["week"] = week
        month = _optional_int(r, "month")
        if month is not None:
            item["month"] = month
        month_day = _optional_int(r, "month_day")
        if month_day is not None:
            item["monthDay"] = month_day
        schedule.append(item)

    days = [x["day"] for x in schedule]
    expected = list(range(1, int(spec["dayCount"]) + 1))
    if days != expected:
        raise SystemExit(
            f"Invalid schedule {spec['id']}: expected days 1..{spec['dayCount']}, got count={len(days)}"
        )
    if any(not x["range"] for x in schedule):
        raise SystemExit(f"Empty reading_range in schedule {spec['id']}")
    return schedule


def build_schedules() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    out_dir = PUBLIC / "schedules"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    default_id = next((s["id"] for s in SCHEDULES if s.get("default")), SCHEDULES[0]["id"])
    catalog_items: list[dict] = []
    default_days: list[dict] | None = None

    for spec in SCHEDULES:
        days = build_one_schedule(spec)
        write_json(out_dir / f"{spec['id']}.json", days, indent=2)
        print(f"schedules/{spec['id']}.json: {len(days)} days")

        entry = {
            "id": spec["id"],
            "title": spec["title"],
            "description": spec.get("description", ""),
            "dayCount": spec["dayCount"],
            "groupMode": spec["groupMode"],
        }
        if spec.get("source"):
            entry["source"] = spec["source"]
        catalog_items.append(entry)

        if spec["id"] == default_id:
            default_days = days

    catalog = {"defaultId": default_id, "schedules": catalog_items}
    write_json(PUBLIC / "schedules.json", catalog, indent=2)
    print(f"schedules.json: {len(catalog_items)} schedules, default={default_id}")

    # Legacy path for TTS scripts that still read schedule.json
    if default_days is None:
        raise SystemExit("No default schedule days to write schedule.json")
    write_json(PUBLIC / "schedule.json", default_days, indent=2)
    print(f"schedule.json: {len(default_days)} days (compat copy of {default_id})")


def write_book(out_dir: Path, abbr: str, file_name: str, chapters: dict[str, dict[str, str]]) -> None:
    write_json(
        out_dir / f"{abbr}.json",
        {"abbr": abbr, "file": file_name, "chapters": chapters},
    )


def build_krv() -> list[dict]:
    out_dir = BIBLE_OUT / "krv"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    book_meta: list[dict] = []
    for f in sorted(KRV_DIR.glob("*.txt")):
        text = f.read_text(encoding="cp949")
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        abbr = None
        for ln in lines:
            m = re.match(r"^([가-힣]+)(\d+):(\d+)\s", ln)
            if m:
                abbr = m.group(1)
                break
        if not abbr:
            print("SKIP krv", f.name)
            continue

        book: dict[str, dict[str, str]] = {}
        for ln in lines:
            m = KRV_VERSE_RE.match(ln)
            if not m:
                continue
            a, ch, vs, body = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
            if a != abbr:
                continue
            book.setdefault(str(ch), {})[str(vs)] = body

        write_book(out_dir, abbr, f.name, book)
        book_meta.append({"abbr": abbr, "file": f.name, "chapterCount": len(book)})

    print(f"bible/krv: {len(book_meta)} books")
    return book_meta


def normalize_rnksv_text(body: str) -> str:
    """Strip paragraph marks and footnote apparatus; keep <subtitle> markers."""
    text = body.replace("○", "")
    text = FOOTNOTE_PAREN_RE.sub("", text)
    text = FOOTNOTE_MARKER_RE.sub("", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s+([,.!?;:…])", r"\1", text)
    return text.strip()


def build_rnksv() -> list[dict]:
    out_dir = BIBLE_OUT / "rnksv"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not RNKSV_PATH.is_file():
        raise SystemExit(f"Missing RNKSV source: {RNKSV_PATH}")

    lines = [ln.strip() for ln in RNKSV_PATH.read_text(encoding="utf-8").splitlines()]
    id_to_abbr: dict[str, str] = {}
    books: dict[str, dict[str, dict[str, str]]] = {}
    source_name = RNKSV_PATH.name

    for ln in lines:
        if not ln or ln.startswith("F1,"):
            continue

        bm = RNKSV_BOOK_RE.match(ln)
        if bm:
            book_id, raw_abbr, _name, _count = bm.group(1), bm.group(2), bm.group(3), bm.group(4)
            abbr = RNKSV_ABBR_NORMALIZE.get(raw_abbr, raw_abbr)
            id_to_abbr[book_id] = abbr
            books.setdefault(abbr, {})
            continue

        vm = RNKSV_VERSE_RE.match(ln)
        if not vm:
            continue
        book_id, ch, vs, body = vm.group(1), int(vm.group(2)), int(vm.group(3)), vm.group(4)
        if ch == 0 and vs == 0:
            continue
        abbr = id_to_abbr.get(book_id)
        if not abbr:
            continue
        cleaned = normalize_rnksv_text(body)
        if not cleaned:
            continue
        books.setdefault(abbr, {}).setdefault(str(ch), {})[str(vs)] = cleaned

    # Preserve canonical order from book headers
    ordered_abbrs = [id_to_abbr[k] for k in sorted(id_to_abbr.keys())]
    book_meta: list[dict] = []
    for abbr in ordered_abbrs:
        chapters = books.get(abbr, {})
        if not chapters:
            print("SKIP rnksv empty", abbr)
            continue
        write_book(out_dir, abbr, source_name, chapters)
        book_meta.append({"abbr": abbr, "file": source_name, "chapterCount": len(chapters)})

    print(f"bible/rnksv: {len(book_meta)} books")
    return book_meta


def clear_legacy_bible_files() -> None:
    """Remove pre-migration flat bible/{abbr}.json files."""
    if not BIBLE_OUT.is_dir():
        return
    for path in BIBLE_OUT.glob("*.json"):
        path.unlink()


def validate_translations(krv_meta: list[dict], rnksv_meta: list[dict]) -> None:
    if len(krv_meta) != 66:
        raise SystemExit(f"krv expected 66 books, got {len(krv_meta)}")
    if len(rnksv_meta) != 66:
        raise SystemExit(f"rnksv expected 66 books, got {len(rnksv_meta)}")

    krv_abbrs = {b["abbr"] for b in krv_meta}
    rnksv_abbrs = {b["abbr"] for b in rnksv_meta}
    if krv_abbrs != rnksv_abbrs:
        missing = sorted(krv_abbrs - rnksv_abbrs)
        extra = sorted(rnksv_abbrs - krv_abbrs)
        raise SystemExit(f"abbr mismatch missing={missing} extra={extra}")

    for tid in ("krv", "rnksv"):
        sample = BIBLE_OUT / tid / "창.json"
        data = json.loads(sample.read_text(encoding="utf-8"))
        v1 = data["chapters"]["1"]["1"]
        if not v1 or "태초" not in v1:
            raise SystemExit(f"{tid}/창 1:1 sample invalid: {v1[:80]!r}")
    print("validation: ok (66 books each, 창1:1 present)")


def build_bible() -> None:
    clear_legacy_bible_files()
    krv_meta = build_krv()
    rnksv_meta = build_rnksv()
    validate_translations(krv_meta, rnksv_meta)

    # Shared meta uses krv file names (source-of-truth for schedule aliases)
    meta = {"books": krv_meta, "aliases": ALIASES}
    write_json(PUBLIC / "books.json", meta, indent=2)

    catalog = {
        "default": "krv",
        "items": [
            {
                "id": t["id"],
                "label": t["label"],
                "shortLabel": t["shortLabel"],
            }
            for t in TRANSLATIONS
        ],
    }
    write_json(PUBLIC / "translations.json", catalog, indent=2)
    print("translations.json: ", ", ".join(t["id"] for t in TRANSLATIONS))


def main() -> None:
    build_schedules()
    build_bible()


if __name__ == "__main__":
    main()
