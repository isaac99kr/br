#!/usr/bin/env python3
"""Audit all shipped chapters against source numbering; write a resumable report."""
import hashlib
import json
import re
from pathlib import Path
from chapter_sources import ROOT, load_chapter


def audit():
    report = {'translations': {}, 'issues': [], 'chapters': []}
    books = json.loads((ROOT / 'public/data/books.json').read_text())['books']
    for translation in ['krv', 'rnksv']:
        count = verses = 0
        for book in books:
            abbr = book['abbr']
            data = json.loads((ROOT / 'public/data/bible' / translation / f'{abbr}.json').read_text())
            if len(data['chapters']) != book['chapterCount']:
                report['issues'].append({'translation': translation, 'book': abbr, 'reason': 'chapter-count'})
            for chapter in sorted(data['chapters'], key=int):
                _, entries = load_chapter(translation, abbr, chapter)
                numbers = [e['verse'] for e in entries]
                covered = {n for e in entries for n in range(e['verse'], e['verseEnd']+1)}
                missing = sorted(set(range(1, max(covered)+1))-covered)
                item = {'translation': translation, 'abbr': abbr, 'chapter': int(chapter),
                        'verseNumbers': numbers, 'missing': missing,
                        'absentVerses': [e['verse'] for e in entries if e['kind'] == 'absent'],
                        'textSha256': hashlib.sha256(json.dumps(entries, ensure_ascii=False).encode()).hexdigest()}
                report['chapters'].append(item)
                if missing:
                    report['issues'].append(dict(item, reason='numbering-gap'))
                count += 1
                verses += len(entries)
        report['translations'][translation] = {'books': len(books), 'chapters': count, 'verseEntries': verses}
    combined = []
    for path in (ROOT / 'asset/bible/개역개정-text').glob('*.txt'):
        for line in path.read_text(encoding='cp949').splitlines():
            m = re.match(r'^([가-힣]+)(\d+):(\d+)-(\d+)\s+(.+)', line)
            if m:
                combined.append({'abbr': m[1], 'chapter': int(m[2]), 'first': int(m[3]),
                                 'last': int(m[4]), 'text': m[5]})
    report['combinedSourceVerses'] = combined
    return report


if __name__ == '__main__':
    report = audit()
    output = ROOT / 'tts/work/source-audit.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'translations': report['translations'], 'issues': len(report['issues']),
                      'combinedSourceVerses': len(report['combinedSourceVerses']), 'report': str(output)}, ensure_ascii=False))
