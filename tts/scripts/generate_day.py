#!/usr/bin/env python3
"""Generate schedule-day TTS audio with Supertonic 3 (female Angelina only)."""

from __future__ import annotations

import argparse
import fcntl
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from supertonic import TTS

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[0]
SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from tts_text import (  # noqa: E402
    PUBLIC,
    RangeSegment,
    _load_aliases,
    _load_book,
    _verses_from_segment,
    chapter_announce,
    parse_reading_range,
    strip_section_title,
)

CONFIG_PATH = ROOT / "config" / "voice-selection.json"
WORK_DAYS = ROOT / "work" / "days"
PUBLIC_AUDIO = REPO / "public" / "audio"
MAX_CHUNK_CHARS = 120  # Supertonic ko default chunk size
DEFAULT_ANNOUNCE_SILENCE = 0.4
DEFAULT_CHUNK_GAP = 0.12


def day_chapters(
    day: int, translation_id: str
) -> tuple[str, list[tuple[str, int, list[tuple[int, str]]]]]:
    """Return (range, [(abbr, chapter, [(verseNum, text), ...]), ...])."""
    schedule = json.loads((PUBLIC / "schedule.json").read_text(encoding="utf-8"))
    item = next(x for x in schedule if x["day"] == day)
    aliases = _load_aliases()
    chapters: list[tuple[str, int, list[tuple[int, str]]]] = []
    cur_key: tuple[str, int] | None = None
    cur_verses: list[tuple[int, str]] = []

    def flush() -> None:
        nonlocal cur_key, cur_verses
        if cur_key is None:
            return
        chapters.append((cur_key[0], cur_key[1], cur_verses))
        cur_key = None
        cur_verses = []

    for seg in parse_reading_range(item["range"]):
        abbr = aliases.get(seg.abbr, seg.abbr)
        book = _load_book(translation_id, abbr)
        if not book:
            continue
        for ch, vnum, text in _verses_from_segment(
            book,
            RangeSegment(abbr, seg.start_chapter, seg.start_verse, seg.end_chapter, seg.end_verse),
        ):
            key = (abbr, ch)
            if cur_key != key:
                flush()
                cur_key = key
            cur_verses.append((vnum, text))
    flush()
    return item["range"], chapters


def chunk_verses(
    verse_items: list[tuple[int, str]], max_chars: int = MAX_CHUNK_CHARS
) -> list[tuple[str, list[tuple[int, str]]]]:
    """Chunk body verses. Returns [(chunkText, [(verseNum, cleaned), ...]), ...]."""
    cleaned: list[tuple[int, str]] = []
    for vnum, raw in verse_items:
        text = strip_section_title(raw)
        if text:
            cleaned.append((vnum, text))
    chunks: list[tuple[str, list[tuple[int, str]]]] = []
    current_parts: list[tuple[int, str]] = []
    current = ""
    for vnum, verse in cleaned:
        candidate = f"{current} {verse}".strip() if current else verse
        if len(candidate) <= max_chars:
            current = candidate
            current_parts.append((vnum, verse))
            continue
        if current_parts:
            chunks.append((current, current_parts))
        current = verse
        current_parts = [(vnum, verse)]
    if current_parts:
        chunks.append((current, current_parts))
    return chunks


def _char_weight(text: str) -> int:
    return max(1, len("".join(text.split())))


def encode_mp3(wav_path: Path, mp3_path: Path, bitrate: str = "48k") -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(wav_path),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            bitrate,
            "-ac",
            "1",
            str(mp3_path),
        ],
        check=True,
        capture_output=True,
    )


def synth_unit(
    tts: TTS,
    style,
    text: str,
    *,
    lang: str,
    speed: float,
    total_steps: int,
    out_wav: Path,
    force: bool,
) -> tuple[np.ndarray, int]:
    if out_wav.is_file() and not force:
        audio, file_sr = sf.read(str(out_wav), dtype="float32")
        return np.asarray(audio, dtype=np.float32).reshape(-1), int(file_sr)

    wav, _dur = tts.synthesize(
        text,
        voice_style=style,
        lang=lang,
        speed=speed,
        total_steps=total_steps,
        silence_duration=0.0,
    )
    audio = np.asarray(wav, dtype=np.float32).reshape(-1)
    sr = int(tts.sample_rate)
    sf.write(str(out_wav), audio, sr)
    return audio, sr


def generate_day(
    tts: TTS,
    style,
    *,
    day: int,
    voice: str,
    speaker: str,
    translation_id: str,
    language: str,
    speed: float,
    total_steps: int,
    announce_silence_sec: float,
    chunk_gap_sec: float,
    force: bool = False,
) -> dict:
    day_dir = WORK_DAYS / translation_id / voice / f"day-{day:03d}"
    day_dir.mkdir(parents=True, exist_ok=True)
    mp3_path = day_dir / "day.mp3"
    wav_path = day_dir / "day.wav"
    meta_path = day_dir / "meta.json"

    if mp3_path.is_file() and meta_path.is_file() and not force:
        print(f"skip existing {mp3_path}")
        return json.loads(meta_path.read_text(encoding="utf-8"))

    reading_range, chapters = day_chapters(day, translation_id)
    sr = int(tts.sample_rate)
    announce_gap = np.zeros(int(sr * announce_silence_sec), dtype=np.float32)
    chunk_gap = np.zeros(int(sr * chunk_gap_sec), dtype=np.float32)
    rebuilt: list[np.ndarray] = []
    cues: list[dict] = []
    verse_cues: list[dict] = []
    pos = 0
    t_day = time.time()

    for abbr, ch, verse_items in chapters:
        announce = chapter_announce(abbr, ch)
        body_chunks = chunk_verses(verse_items)
        print(f"  {announce}: {len(verse_items)}v → announce + {len(body_chunks)} chunks")
        cues.append(
            {
                "abbr": abbr,
                "chapter": ch,
                "announce": announce,
                "startMs": int(pos / sr * 1000),
            }
        )

        # 1) chapter announce alone
        ann_wav = day_dir / f"{abbr}_{ch}_announce.wav"
        print(f"    announce ({len(announce)} chars)...")
        t0 = time.time()
        audio, sr = synth_unit(
            tts,
            style,
            announce,
            lang=language,
            speed=speed,
            total_steps=total_steps,
            out_wav=ann_wav,
            force=force,
        )
        print(f"      {len(audio) / sr:.1f}s in {time.time() - t0:.1f}s")
        rebuilt.append(audio)
        pos += len(audio)
        rebuilt.append(announce_gap)
        pos += len(announce_gap)

        # 2) body chunks — apportion verse startMs by char weight within each chunk
        for ci, (chunk, parts) in enumerate(body_chunks):
            chunk_wav = day_dir / f"{abbr}_{ch}_c{ci:02d}.wav"
            print(f"    body {ci + 1}/{len(body_chunks)} ({len(chunk)} chars)...")
            t0 = time.time()
            audio, sr = synth_unit(
                tts,
                style,
                chunk,
                lang=language,
                speed=speed,
                total_steps=total_steps,
                out_wav=chunk_wav,
                force=force,
            )
            print(f"      {len(audio) / sr:.1f}s in {time.time() - t0:.1f}s")
            chunk_start_ms = int(pos / sr * 1000)
            chunk_dur_ms = int(len(audio) / sr * 1000)
            weights = [_char_weight(t) for _vn, t in parts]
            total_w = sum(weights) or 1
            acc_w = 0
            for (vnum, _text), w in zip(parts, weights):
                verse_cues.append(
                    {
                        "abbr": abbr,
                        "chapter": ch,
                        "verse": vnum,
                        "startMs": chunk_start_ms + int((acc_w / total_w) * chunk_dur_ms),
                    }
                )
                acc_w += w
            rebuilt.append(audio)
            pos += len(audio)
            if ci < len(body_chunks) - 1:
                rebuilt.append(chunk_gap)
                pos += len(chunk_gap)

        # short gap between chapters (reuse chunk gap)
        rebuilt.append(chunk_gap)
        pos += len(chunk_gap)

    full = np.concatenate(rebuilt) if rebuilt else np.zeros(0, dtype=np.float32)
    if len(full) >= len(chunk_gap):
        full = full[: -len(chunk_gap)]
        pos = len(full)

    sf.write(str(wav_path), full, sr)
    encode_mp3(wav_path, mp3_path)

    rel_path = f"audio/{translation_id}/{voice}/day-{day:03d}.mp3"
    meta = {
        "day": day,
        "translationId": translation_id,
        "voice": voice,
        "speakerId": speaker,
        "engine": "supertonic3",
        "range": reading_range,
        "path": rel_path,
        "durationMs": int(len(full) / sr * 1000),
        "sampleRate": sr,
        "bytes": mp3_path.stat().st_size,
        "chapters": cues,
        "verses": verse_cues,
        "status": "draft",
        "genSec": round(time.time() - t_day, 1),
        "announceSilenceSec": announce_silence_sec,
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"day {day} {voice}: {meta['durationMs'] / 1000:.1f}s, "
        f"{meta['bytes'] / 1024:.0f}KB, gen {meta['genSec']}s"
    )
    return meta


def publish(metas: list[dict], cfg: dict) -> None:
    PUBLIC_AUDIO.mkdir(parents=True, exist_ok=True)
    lock_path = PUBLIC_AUDIO / ".publish.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+", encoding="utf-8") as lock_f:
        fcntl.flock(lock_f.fileno(), fcntl.LOCK_EX)
        try:
            _publish_unlocked(metas, cfg)
        finally:
            fcntl.flock(lock_f.fileno(), fcntl.LOCK_UN)


def _publish_unlocked(metas: list[dict], cfg: dict) -> None:
    sets: dict[tuple[str, str], dict] = {}

    for meta in metas:
        voice = meta["voice"]
        tid = meta["translationId"]
        src = WORK_DAYS / tid / voice / f"day-{meta['day']:03d}" / "day.mp3"
        if not src.is_file():
            raise FileNotFoundError(f"missing work mp3 for publish: {src}")
        dest_dir = PUBLIC_AUDIO / tid / voice
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"day-{meta['day']:03d}.mp3"
        dest.write_bytes(src.read_bytes())

        key = (tid, voice)
        if key not in sets:
            speaker = cfg["female"]["speaker"]
            sets[key] = {
                "translationId": tid,
                "voice": voice,
                "speakerId": speaker,
                "days": [],
            }
        by_day = {d["day"]: d for d in sets[key]["days"]}
        day_entry: dict = {
            "day": meta["day"],
            "path": meta["path"],
            "durationMs": meta["durationMs"],
            "bytes": meta["bytes"],
            "chapters": meta["chapters"],
            "status": meta["status"],
        }
        if meta.get("verses"):
            day_entry["verses"] = meta["verses"]
        by_day[meta["day"]] = day_entry
        sets[key]["days"] = [by_day[k] for k in sorted(by_day)]

    manifest_path = PUBLIC_AUDIO / "manifest.json"
    # Female-only publish: drop any previous male sets from Qwen era.
    manifest = {
        "version": 2,
        "modelVersion": cfg["modelId"],
        "engine": cfg.get("engine", "supertonic3"),
        "configVersion": f"voice-selection@{cfg.get('version', 1)}",
        "format": "mp3",
        "sets": list(sets.values()),
    }
    # Merge only female sets for same translation
    if manifest_path.is_file():
        prev = json.loads(manifest_path.read_text(encoding="utf-8"))
        merged: dict[tuple[str, str], dict] = {}
        for s in prev.get("sets") or []:
            if s.get("voice") == "male":
                continue
            merged[(s["translationId"], s["voice"])] = s
        for key, s in sets.items():
            if key in merged:
                by_day = {d["day"]: d for d in merged[key].get("days", [])}
                for d in s["days"]:
                    by_day[d["day"]] = d
                s["days"] = [by_day[k] for k in sorted(by_day)]
            merged[key] = s
        manifest["sets"] = list(merged.values())

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"published → {manifest_path}")


def parse_days(spec: str) -> list[int]:
    days: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            days.extend(range(int(a), int(b) + 1))
        else:
            days.append(int(part))
    return days


def load_metas(
    *,
    days: list[int],
    voices: list[str],
    translation_id: str,
) -> list[dict]:
    metas: list[dict] = []
    for voice in voices:
        for day in days:
            meta_path = WORK_DAYS / translation_id / voice / f"day-{day:03d}" / "meta.json"
            if not meta_path.is_file():
                raise FileNotFoundError(f"missing meta for publish-only: {meta_path}")
            metas.append(json.loads(meta_path.read_text(encoding="utf-8")))
    return metas


def main() -> None:
    try:
        sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
    except Exception:
        pass

    parser = argparse.ArgumentParser()
    parser.add_argument("--days", default="1")
    parser.add_argument("--voices", default="female")
    parser.add_argument(
        "--translation",
        choices=["krv", "rnksv"],
        default=None,
        help="Override voice-selection.json translationId",
    )
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--no-publish",
        action="store_true",
        help="Generate work audio/meta only (skip public/ + manifest)",
    )
    parser.add_argument(
        "--publish-each",
        action="store_true",
        help="Publish after each day (safe with flock for parallel translations)",
    )
    parser.add_argument(
        "--publish-only",
        action="store_true",
        help="Publish existing work metas for --days/--translation/--voices",
    )
    args = parser.parse_args()

    if args.no_publish and args.publish_only:
        raise SystemExit("use either --no-publish or --publish-only, not both")
    if args.no_publish and args.publish_each:
        raise SystemExit("use either --no-publish or --publish-each, not both")

    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if cfg.get("engine") != "supertonic3":
        raise SystemExit("voice-selection.json engine must be supertonic3")

    translation_id = args.translation or cfg["translationId"]
    days = parse_days(args.days)
    voices = [v.strip() for v in args.voices.split(",") if v.strip()]
    if any(v == "male" for v in voices):
        raise SystemExit("male voice is disabled for this track")
    voices = [v for v in voices if v == "female"]
    if not voices:
        raise SystemExit("no voices to generate (female only)")

    if args.publish_only:
        metas = load_metas(days=days, voices=voices, translation_id=translation_id)
        publish(metas, cfg)
        return

    female = cfg["female"]
    style_path = ROOT / female["stylePath"]
    if not style_path.is_file():
        raise SystemExit(
            f"missing voice style JSON: {style_path}\n"
            "Clone Angelina first (see tts/voices/refs + supertonic3-tts clone)."
        )

    rules = cfg.get("readingRules") or {}
    announce_silence = float(rules.get("announceSilenceSec", DEFAULT_ANNOUNCE_SILENCE))
    chunk_gap = float(rules.get("chunkGapSec", DEFAULT_CHUNK_GAP))
    language = cfg.get("language", "ko")
    speed = float(female.get("speed", 1.05))
    total_steps = int(female.get("totalSteps", 8))

    print(
        f"engine=supertonic3 translation={translation_id} "
        f"style={style_path} lang={language} speed={speed}"
    )
    t0 = time.time()
    tts = TTS(model="supertonic-3")
    style = tts.get_voice_style_from_path(style_path)
    print(f"model loaded in {time.time() - t0:.1f}s (sr={tts.sample_rate})")

    metas: list[dict] = []
    batch_t0 = time.time()
    for voice in voices:
        speaker = female["speaker"]
        for i, day in enumerate(days, start=1):
            print(
                f"=== [{i}/{len(days)}] day {day} {translation_id}/{voice}/{speaker} ===",
                flush=True,
            )
            meta = generate_day(
                tts,
                style,
                day=day,
                voice=voice,
                speaker=speaker,
                translation_id=translation_id,
                language=language,
                speed=speed,
                total_steps=total_steps,
                announce_silence_sec=announce_silence,
                chunk_gap_sec=chunk_gap,
                force=args.force,
            )
            metas.append(meta)
            if args.publish_each:
                publish([meta], cfg)
            elapsed = time.time() - batch_t0
            print(
                f"progress {translation_id}: {i}/{len(days)} days done, "
                f"elapsed {elapsed / 60:.1f}m",
                flush=True,
            )

    if args.no_publish:
        print(f"skip publish ({len(metas)} meta(s) in work/)")
    elif not args.publish_each:
        publish(metas, cfg)


if __name__ == "__main__":
    main()
