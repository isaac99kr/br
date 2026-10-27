"""Offline regression tests for resumable part integrity."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path

import numpy as np

from generate_chapter import atomic_json, save_wave, sha256, verified_part, wave


class PartIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'verse-001.wav'
        self.audio = np.linspace(-0.25, 0.25, 1000, dtype=np.float32)
        save_wave(self.path, self.audio, 44100)
        self.info = {'generationHash': 'condition-a', 'sha256': sha256(self.path),
                     'samples': 1000, 'sampleRate': 44100}
        atomic_json(self.path.with_suffix('.json'), self.info)

    def test_valid_float_wav_roundtrip(self):
        np.testing.assert_array_equal(verified_part(self.path, 44100, 'condition-a'), self.audio)

    def test_changed_condition_is_rejected(self):
        with self.assertRaises(ValueError):
            verified_part(self.path, 44100, 'condition-b')

    def test_truncated_file_is_rejected(self):
        self.path.write_bytes(self.path.read_bytes()[:100])
        with self.assertRaises(ValueError):
            verified_part(self.path, 44100, 'condition-a')

    def test_sample_metadata_mismatch_is_rejected(self):
        self.info['samples'] -= 1
        atomic_json(self.path.with_suffix('.json'), self.info)
        with self.assertRaises(ValueError):
            verified_part(self.path, 44100, 'condition-a')

    def test_wrong_sample_rate_is_rejected(self):
        with self.assertRaises(ValueError):
            wave(self.path, 48000)

    def test_nonfinite_audio_is_rejected_before_write(self):
        with self.assertRaises(ValueError):
            save_wave(self.path, np.array([np.nan], dtype=np.float32), 44100)
        np.testing.assert_array_equal(wave(self.path, 44100), self.audio)


class SourceTests(unittest.TestCase):
    def test_scripture_variants_are_not_headings(self):
        from chapter_sources import clean_text
        self.assertEqual(clean_text('<어떤 사람이 예수께 와서 말하였다.>'), '어떤 사람이 예수께 와서 말하였다.')
        self.assertEqual(clean_text('이는 <하나님께> 감사드립니다.'), '이는 하나님께 감사드립니다.')
        self.assertEqual(clean_text('<제1권> <단락 제목> 본문\x00'), '본문')

    def test_combined_source_and_absence(self):
        from chapter_sources import load_chapter
        _, romans = load_chapter('krv', '롬', 9)
        self.assertEqual((romans[0]['verse'], romans[0]['verseEnd']), (1, 2))
        _, acts = load_chapter('rnksv', '행', 8)
        absent = next(v for v in acts if v['verse'] == 37)
        self.assertEqual((absent['kind'], absent['text']), ('absent', '없음.'))

    def test_audit_has_no_unexplained_numbering_gaps(self):
        from audit_chapter_sources import audit
        report = audit()
        self.assertEqual(report['issues'], [])
        self.assertEqual(len(report['chapters']), 2378)
        self.assertEqual(len(report['combinedSourceVerses']), 11)

    def test_completed_asset_integrity_without_wavs(self):
        from generate_chapters import intact
        from generate_chapter import ROOT, read_json
        original = next((ROOT/'tts/work/chapters/krv/GEN/001').glob('*/validation.json'), None)
        # Find the current schema, not the original experimental sample.
        for candidate in (ROOT/'tts/work/chapters/krv/GEN/001').glob('*/validation.json'):
            if 'timingSha256' in read_json(candidate):
                original = candidate
                break
        if original is None or 'timingSha256' not in read_json(original):
            self.skipTest('A generated v2 fixture is required')
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            for path in original.parent.iterdir():
                if path.suffix in ['.json', '.mp3']:
                    shutil.copyfile(path, directory/path.name)
            self.assertTrue(intact(directory))
            timing = next(directory.glob('*_[0-9][0-9][0-9].json'))
            data = json.loads(timing.read_text())
            data['verses'][0]['startSample'] += 1
            atomic_json(timing, data)
            self.assertFalse(intact(directory))


if __name__ == '__main__':
    unittest.main()
