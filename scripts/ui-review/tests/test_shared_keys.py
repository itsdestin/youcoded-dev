"""Card #18(e): review-cards.py warns at build time when two deck specs in one folder share a
`key`. WHY: round 2 and 3 of a deck reused round 1's key, so one round's answers could be read
as another's (2026-09-16). Picture-free, so CI runs it."""
import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
from fixture import words_spec   # noqa: E402

# review-cards.py has a hyphen, so it cannot be a plain import.
_spec = importlib.util.spec_from_file_location('review_cards', os.path.join(os.path.dirname(HERE), 'review-cards.py'))
rc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rc)


def write(folder, name, doc):
    with open(os.path.join(folder, name), 'w') as f:
        json.dump(doc, f)
    return os.path.join(folder, name)


class SharedKeyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.folder = os.path.join(self.tmp, 'deck')
        self.path = words_spec(self.tmp)            # key 'questions-fixture'
        self.spec = rc.load_spec(self.path)

    def other(self, name, key, steps=True):
        doc = {'title': 'x', 'key': key}
        if steps:
            doc['steps'] = []
        return write(self.folder, name, doc)

    def test_same_key_in_same_folder_is_found(self):
        twin = self.other('round2.json', self.spec['key'])
        self.assertEqual(rc.shared_key_specs(self.spec), [twin])

    def test_different_key_is_not(self):
        self.other('round2.json', 'another-key')
        self.assertEqual(rc.shared_key_specs(self.spec), [])

    def test_own_file_answers_files_and_non_specs_are_ignored(self):
        # answers file carries the same key and steps; a non-spec json has the key but no steps
        self.other('questions.answers.json', self.spec['key'])
        self.other('notes.json', self.spec['key'], steps=False)
        write(self.folder, 'broken.json', {})
        with open(os.path.join(self.folder, 'bad.json'), 'w') as f:
            f.write('{not json')
        self.assertEqual(rc.shared_key_specs(self.spec), [])

    def test_build_command_prints_the_warning(self):
        twin = self.other('round2.json', self.spec['key'])
        err = io.StringIO()
        # contract-check loads the spec, warns, then stops ("no contract step"): no pictures needed.
        with contextlib.redirect_stderr(err):
            code = rc.main(['contract-check', self.path])
        self.assertEqual(code, 1)
        self.assertIn('WARNING: ' + os.path.basename(twin), err.getvalue())
        self.assertIn('also has key', err.getvalue())

    def test_no_warning_when_keys_differ(self):
        self.other('round2.json', 'unique')
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            rc.main(['contract-check', self.path])
        self.assertNotIn('WARNING', err.getvalue())


if __name__ == '__main__':
    unittest.main()
