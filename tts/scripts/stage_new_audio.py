#!/usr/bin/env python3
"""Stage only the approved 220–246 MP3 set for the web app.

Input remains the local, ignored tts/legacy-audio workspace. The generated
public/audio directory is the curated, tracked Pages payload; it is not a
replacement for the source recordings.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEGACY = ROOT / "tts" / "legacy-audio"
OUTPUT = ROOT / "public" / "audio"
DAYS = set(range(220, 247))
TRANSLATIONS = {"krv", "rnksv"}
# These days changed after the original 2026-10-10 batch.  Their work metadata
# must prove that the current schedule, rather than the legacy recording, was
# used before any web asset is staged.
REGENERATED_DAYS = {223, 224, 226, 229, 235, 236}
WORK_DAYS = ROOT / "tts" / "work" / "days"


def main() -> None:
    source_manifest = LEGACY / "manifest.json"
    manifest = json.loads(source_manifest.read_text(encoding="utf-8"))
    schedule = json.loads((ROOT / "public" / "data" / "schedule.json").read_text(encoding="utf-8"))
    current_ranges = {item["day"]: item["range"] for item in schedule if item["day"] in REGENERATED_DAYS}
    for translation_id in TRANSLATIONS:
        for day in REGENERATED_DAYS:
            meta_path = WORK_DAYS / translation_id / "female" / f"day-{day:03d}" / "meta.json"
            if not meta_path.is_file():
                raise SystemExit(f"missing regenerated metadata: {meta_path}")
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if meta.get("range") != current_ranges[day]:
                raise SystemExit(f"stale regenerated metadata: {translation_id} day {day}")
    staged_sets: list[dict] = []

    for audio_set in manifest.get("sets", []):
        translation_id = audio_set.get("translationId")
        voice = audio_set.get("voice")
        if translation_id not in TRANSLATIONS or voice != "female":
            continue
        days = [entry for entry in audio_set.get("days", []) if entry.get("day") in DAYS]
        if {entry.get("day") for entry in days} != DAYS:
            missing = sorted(DAYS - {entry.get("day") for entry in days})
            raise SystemExit(f"missing manifest entries: {audio_set.get('translationId')} {missing}")
        for entry in days:
            source = LEGACY / translation_id / voice / f"day-{entry['day']:03d}.mp3"
            if not source.is_file():
                raise SystemExit(f"missing MP3: {source}")
            target = OUTPUT / translation_id / voice / source.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        staged_sets.append({**audio_set, "days": sorted(days, key=lambda entry: entry["day"])})

    if len(staged_sets) != len(TRANSLATIONS):
        raise SystemExit("missing female audio set for a supported translation")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    output_manifest = {**manifest, "sets": staged_sets}
    (OUTPUT / "manifest.json").write_text(
        json.dumps(output_manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"staged {len(DAYS)} days × {len(staged_sets)} translations → {OUTPUT}")


if __name__ == "__main__":
    main()
