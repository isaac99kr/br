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
CSV_PATH = ROOT / "asset" / "schedule" / "bible_reading_schedule.csv"
KRV_DIR = ROOT / "asset" / "bible" / "개역개정-text"
RNKSV_PATH = ROOT / "asset" / "bible" / "표준새번역개정판.txt"

# CSV abbreviation -> file-internal abbreviation
ALIASES = {
    "라": "스",  # Ezra
    "스": "슥",  # Zechariah
    "나훔": "나",
    "스바냐": "습",
}

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
    write_json(PUBLIC / "schedule.json", schedule, indent=2)
    print(f"schedule.json: {len(schedule)} days")


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
    build_schedule()
    build_bible()


if __name__ == "__main__":
    main()
