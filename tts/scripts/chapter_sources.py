"""Shared, versioned reading input. Never infer missing verse text."""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEXT_VERSION = 2
ABSENT = re.compile(r'^(?:[a-z])?\([^)]*없음\)$')


def clean_text(text):
    text = ''.join(c for c in text if not unicodedata.category(c).startswith('C') or c in '\n\t')
    # Leading tags are headings. Inline short angle-bracket variants are scripture.
    while text.lstrip().startswith('<'):
        match = re.match(r'^\s*<([^>]+)>\s*(.*)$', text, re.S)
        if not match:
            break
        # An entire bracketed verse is a textual variant, not a heading.
        if not match[2].strip():
            text = match[1]
            break
        text = match[2]
    text = re.sub(r'<[^>]*\([^>]*\d+:\d+[^>]*\)[^>]*>', ' ', text)
    text = re.sub(r'<([^>]+)>', r'\1', text)
    return ' '.join(text.split())


def load_chapter(translation, abbr, chapter):
    path = ROOT / 'public/data/bible' / translation / f'{abbr}.json'
    book = json.loads(path.read_text())
    raw = book['chapters'][str(chapter)]
    combined = book.get('combinedVerses', {}).get(str(chapter), {})
    entries = []
    for key in sorted(raw, key=int):
        text = clean_text(raw[key])
        if not text:
            raise ValueError(f'빈 본문: {translation}/{abbr}/{chapter}/{key}')
        absent = bool(ABSENT.fullmatch(text))
        entries.append({'verse': int(key), 'text': '없음.' if absent else text,
                        'sourceText': raw[key], 'verseEnd': combined.get(key, int(key)), 'kind': 'absent' if absent else 'verse'})
    return path, entries
