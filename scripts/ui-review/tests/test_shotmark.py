# Pins the "real app" picture rule (deck/shotmark.py, spec._validate_pictures).
# WHY (Destin, 2026-11-23: "it make fully custom/unique mockup ui's instead of basing on the real app?"): a deck's design
# options were photographs of hand-written HTML. A question's or option's picture must now carry the label `shoot` /
# `explore` write; a crop keeps it; a deck about something else says so with "not_the_app".
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from io import BytesIO

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from PIL import Image  # noqa: E402

from deck.shotmark import _with_mark, crop_shot, read_mark  # noqa: E402
from deck.spec import load_spec, validate  # noqa: E402

HERE = os.path.dirname(__file__)


def png(w=40, h=30):
    b = BytesIO(); Image.new('RGB', (w, h), (200, 100, 50)).save(b, 'PNG'); return b.getvalue()


def question(**extra):
    return {'id': 'Q-1', 'words': True, 'headline': 'Where should it sit?', 'today': 'It floats over the chat.',
            'checked': 'Read the code.', 'problem': 'It covers messages.', 'proposal': 'Move it.',
            'options': [{'id': 'a', 'label': 'Above the box', 'pros': ['Clear.'], 'picture': 'pictures/a.png'},
                        {'id': 'b', 'label': 'In the chat', 'pros': ['Close.'], 'picture': 'pictures/b.png'}], **extra}


class ShotMark(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); os.makedirs(os.path.join(self.tmp, 'pictures'))
        self.addCleanup(shutil.rmtree, self.tmp)

    def pic(self, name, real=True):
        data = _with_mark(png(), {'by': 'shoot', 'screen': 'chat'}) if real else png()
        open(os.path.join(self.tmp, 'pictures', name), 'wb').write(data)

    def errors(self, **top):
        spec = {'title': 'T', 'key': 't', 'out': 'deck.html', **top, 'steps': [question()]}
        path = os.path.join(self.tmp, 'deck.json'); json.dump(spec, open(path, 'w'))
        return [e for e in validate(load_spec(path))[0] if 'real screenshot' in e]

    def test_real_screenshots_pass(self):
        self.pic('a.png'); self.pic('b.png')
        self.assertEqual(self.errors(), [])

    def test_a_drawn_picture_is_refused(self):
        self.pic('a.png'); self.pic('b.png', real=False)
        errs = self.errors()
        self.assertEqual(len(errs), 1); self.assertIn('Q-1/b', errs[0]); self.assertIn('shoot', errs[0])

    def test_a_deck_about_something_else_says_so(self):
        self.pic('a.png', real=False); self.pic('b.png', real=False)
        self.assertEqual(self.errors(not_the_app='the review deck tool itself'), [])
        self.assertEqual(len(self.errors(not_the_app='x')), 2, 'one word does not say what the pictures show')

    def test_a_crop_keeps_the_label_and_a_drawing_cannot_be_cropped_into_one(self):
        self.pic('a.png'); self.pic('b.png', real=False)
        src, dst = os.path.join(self.tmp, 'pictures', 'a.png'), os.path.join(self.tmp, 'pictures', 'a-crop.png')
        info = crop_shot(src, dst, (5, 5, 20, 10))
        self.assertEqual(info['crop'], [5, 5, 20, 10]); self.assertEqual(read_mark(dst)['screen'], 'chat')
        self.assertEqual(Image.open(dst).size, (20, 10))
        with self.assertRaises(ValueError):
            crop_shot(os.path.join(self.tmp, 'pictures', 'b.png'), dst, (0, 0, 5, 5))
        with self.assertRaises(ValueError):
            crop_shot(src, dst, (30, 0, 20, 10))   # leaves the picture

    def test_the_node_writer_and_the_python_reader_agree(self):
        if not shutil.which('node'):
            self.skipTest('node is not installed')
        src = os.path.join(self.tmp, 'raw.png'); open(src, 'wb').write(png())
        mod = os.path.abspath(os.path.join(HERE, '..', '..', 'shoot', 'shotmark.mjs'))
        code = (f"import {{ markShot, readShotMark }} from {json.dumps('file://' + mod)}; import {{ readFileSync, writeFileSync }} from 'node:fs';"
                f"const out = markShot(readFileSync({json.dumps(src)}), {{ by: 'shoot', screen: 'chat#x', theme: 'creme' }});"
                f"writeFileSync({json.dumps(src)}, out); if (readShotMark(out).screen !== 'chat#x') process.exit(3);")
        subprocess.run(['node', '--input-type=module', '-e', code], check=True)
        self.assertEqual(read_mark(src), {'by': 'shoot', 'screen': 'chat#x', 'theme': 'creme'})
        self.assertEqual(Image.open(src).size, (40, 30), 'the label changes no pixel and the picture still opens')


if __name__ == '__main__':
    unittest.main()
