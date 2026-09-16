import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import subtitles


class SubtitleTextTests(unittest.TestCase):
    def test_apostrophes_and_accents_are_preserved(self):
        text = "Flottement sur l'IA. C'est d\u00e9j\u00e0 tr\u00e8s attendu, l\u2019\u00e9pargne."
        tokens = text.split()
        recognized = [{'word': subtitles.normalize(token), 'start': i * .3, 'end': (i + 1) * .3} for i, token in enumerate(tokens)]
        words = subtitles.anchor_words(text, 0, len(tokens) * .3, recognized)
        self.assertEqual(' '.join(w['text'] for w in words), text)

    def test_zero_gap_does_not_delete_contraction(self):
        words = subtitles.anchor_words("\u00c7a n'a pas \u00e9t\u00e9 vot\u00e9.", 0, 2, [
            {'word': 'ca', 'start': 0, 'end': .4},
            {'word': 'pas', 'start': .4, 'end': .8},
            {'word': 'ete', 'start': .8, 'end': 1.3},
            {'word': 'vote', 'start': 1.3, 'end': 2},
        ])
        self.assertEqual(' '.join(w['text'] for w in words), "\u00c7a n'a pas \u00e9t\u00e9 vot\u00e9.")
        self.assertTrue(all(w['end'] > w['start'] for w in words))

    def test_zero_gap_at_edges_keeps_every_word(self):
        words = subtitles.anchor_words("L'IA avance d\u00e9j\u00e0.", 0, 1, [
            {'word': 'avance', 'start': 0, 'end': 1},
        ])
        self.assertEqual(' '.join(w['text'] for w in words), "L'IA avance d\u00e9j\u00e0.")

    def test_unknown_words_keep_positive_timing(self):
        words = subtitles.anchor_words("L'IA est l\u00e0.", 0, .01, [])
        self.assertEqual(' '.join(w['text'] for w in words), "L'IA est l\u00e0.")
        self.assertTrue(all(w['end'] > w['start'] for w in words))

    def test_ass_and_srt_retain_original_unicode(self):
        from PIL import ImageFont
        words = [{'text': "l'IA", 'start': 0, 'end': .5}, {'text': "d\u00e9j\u00e0", 'start': .5, 'end': 1}]
        with tempfile.TemporaryDirectory() as folder:
            ass, srt = Path(folder) / 'test.ass', Path(folder) / 'test.srt'
            font = ImageFont.load_default()
            with patch.object(ImageFont, 'truetype', return_value=font):
                subtitles.write_captions(words, ass, srt)
            self.assertIn("L'IA", ass.read_text(encoding='utf-8'))
            self.assertIn('D\u00c9J\u00c0', ass.read_text(encoding='utf-8'))
            self.assertIn("l'IA d\u00e9j\u00e0", srt.read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
