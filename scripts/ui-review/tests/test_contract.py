"""The contract step (rows Destin signs off) and, from Task 4, contract-check + the acceptance
deck. Picture-free like test_live.py. Design: docs/active/specs/2026-09-01-feature-flow-design.md §3–§7."""
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
from fixture import contract_spec                                   # noqa: E402
from deck.build import build_page, deck_data                        # noqa: E402
from deck.spec import is_contract, load_spec, no_pictures, validate   # noqa: E402


def spec_with(tmp, mutate, **over):
    p = contract_spec(tmp, **over)
    with open(p) as f:
        raw = json.load(f)
    mutate(raw)
    with open(p, 'w') as f:
        json.dump(raw, f)
    return load_spec(p)


def errs(spec):
    return validate(spec)[0]


class ContractStepTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_valid_contract_has_no_errors_and_no_pictures(self):
        s = load_spec(contract_spec(self.tmp))
        self.assertTrue(is_contract(s['steps'][0])); self.assertTrue(no_pictures(s))
        self.assertEqual(errs(s), [])

    def test_row_fields(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][0].update({'checkedBy': 'vibes', 'source': 'nohash'}))
        e = errs(s)
        self.assertTrue(any('C/R1: checkedBy must be one of mechanical, deck, live-app, human' in x for x in e))
        self.assertTrue(any('C/R1: source must look like <deck key>#<step id>' in x for x in e))

    def test_mechanical_needs_a_guard(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][2].pop('guard'))
        self.assertTrue(any('C/R3: a mechanical row needs a guard' in x for x in errs(s)))

    def test_source_key_must_be_in_sources(self):
        s = spec_with(self.tmp, lambda r: r['sources'].pop('arcade-r1'))
        self.assertTrue(any('C/R2: source deck "arcade-r1" is not in the spec\'s "sources"' in x for x in errs(s)))

    def test_verdict_needs_evidence(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][0].update({'verdict': 'pass'}))
        self.assertTrue(any('C/R1: a verdict needs evidence' in x for x in errs(s)))
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][0].update({'verdict': 'maybe', 'evidence': 'x'}))
        self.assertTrue(any('C/R1: verdict must be pass or fail' in x for x in errs(s)))

    def test_statement_obeys_writing_rules(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][0].update({'statement': 'The reducer stores it.'}))
        self.assertTrue(any('C/R1: statement uses banned word "reducer"' in x for x in errs(s)))

    def test_duplicate_row_ids(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][1].update({'id': 'R1'}))
        self.assertTrue(any('C: duplicate row id "R1"' in x for x in errs(s)))

    def test_empty_rows_is_the_contract_error_not_a_missing_crop(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0].update({'rows': []}))
        e = errs(s)
        self.assertTrue(any('C: a contract with no rows defines nothing' in x for x in e), e)
        self.assertFalse(any('missing crop' in x for x in e), e)

    def test_contract_refuses_options(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0].update({'options': [{'id': 'a', 'label': 'x', 'summary': 'y'}]}))
        self.assertTrue(any('C: a contract step has no options' in x for x in errs(s)))

    def test_deck_data_and_page(self):
        s = load_spec(contract_spec(self.tmp))
        st = deck_data(s, {})['steps'][0]
        self.assertEqual((st['kind'], st['words']), ('contract', True))
        self.assertEqual([r['id'] for r in st['rows']], ['R1', 'R2', 'R3'])
        self.assertEqual((st['yes'], st['no']), ('Yes, that is done', 'No, something is missing'))
        self.assertNotIn('options', st)
        page, _ = build_page(s, {})
        self.assertIn('"kind": "contract"', page)


if __name__ == '__main__':
    unittest.main()
