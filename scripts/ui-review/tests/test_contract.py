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


# Fix: bare `json.dump(a, open(ap, 'w'))` / `json.load(open(ap))` leave the file handle open
# until GC — 13 ResourceWarnings across this file's tests. These two helpers are the only way
# the tests below read or write a JSON fixture file.
def read_json(p):
    with open(p) as f:
        return json.load(f)


def write_json(p, obj):
    with open(p, 'w') as f:
        json.dump(obj, f)


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

    def test_statement_too_long_names_the_acceptance_deck_headline(self):
        # WHY: a long statement used to pass contract-check, then break the acceptance deck
        # later with an error naming a field the contract's author never wrote (spec.py fix).
        long_statement = ' '.join(['word'] * 30)
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][0].update({'statement': long_statement}))
        e = errs(s)
        self.assertTrue(any('C/R1: statement is 30 words (max 25)' in x and 'acceptance deck' in x for x in e), e)

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


class ContractCheckTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_fixture_contract_holds(self):
        from deck.contract import check_contract
        s = load_spec(contract_spec(self.tmp))
        self.assertEqual(check_contract(s), [])

    def test_unsubmitted_source_is_reported(self):
        from deck.contract import check_contract
        p = contract_spec(self.tmp)
        ap = os.path.join(os.path.dirname(p), 'r1.answers.json')
        a = read_json(ap); a['submitted'] = None; write_json(ap, a)
        problems = check_contract(load_spec(p))
        self.assertTrue(any('R2: r1.json answers were never submitted' in x for x in problems), problems)

    def test_rotated_answers_are_found(self):
        # serve re-run after a submit moves the file to <stem>.answers.<stamp>.json (serve.rotate_submitted);
        # the check reads the newest SUBMITTED file, whichever name it carries.
        from deck.contract import check_contract
        p = contract_spec(self.tmp); d = os.path.dirname(p)
        os.replace(os.path.join(d, 'r1.answers.json'), os.path.join(d, 'r1.answers.202609010930.json'))
        write_json(os.path.join(d, 'r1.answers.json'), {'deck': 'arcade-r1', 'submitted': None, 'answers': {}})
        self.assertEqual(check_contract(load_spec(p)), [])

    def test_skipped_step_is_not_a_source(self):
        from deck.contract import check_contract
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][1].update({'source': 'arcade-r1#S-2'}))
        self.assertTrue(any('R2: step S-2 of arcade-r1 was not answered' in x for x in check_contract(s)))

    def test_unknown_step_and_missing_guard(self):
        from deck.contract import check_contract
        s = spec_with(self.tmp, lambda r: (r['steps'][0]['rows'][0].update({'source': 'arcade-r1#S-9'}),
                                           r['steps'][0]['rows'][2].update({'guard': 'scripts/nope.py'})))
        problems = check_contract(s)
        self.assertTrue(any('R1: no step "S-9" in r1.json' in x for x in problems), problems)
        # WHY this text, not the brief's "does not exist": check_contract's actual message (matching
        # design §4 and test_guard_committed_on_the_branch_counts below) always names BOTH places a
        # guard is looked for — disk and the contract's branch — so a plain "does not exist" never
        # appears; the brief's literal test text was stale against its own contract.py.
        self.assertTrue(any('R3: guard scripts/nope.py is neither on disk under' in x for x in problems), problems)

    def test_guard_committed_on_the_branch_counts(self):
        # A feature's mechanical rows mostly name tests the feature ADDS. From a worktree the
        # workspace root is the main checkout, where that file does not exist until merge — so
        # the check also looks on the contract's branch. Uncommitted still does not count.
        import subprocess
        from unittest import mock
        from deck.contract import check_contract, guard_exists
        root = os.path.join(self.tmp, 'ws'); os.makedirs(os.path.join(root, 'scripts'))
        g = lambda *a: subprocess.run(['git', '-C', root, *a], check=True, capture_output=True, text=True)
        g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't')
        with open(os.path.join(root, 'README'), 'w') as f:
            f.write('x')
        g('add', 'README'); g('commit', '-qm', 'base')
        g('checkout', '-qb', 'feat/x')
        with open(os.path.join(root, 'scripts', 'guard.py'), 'w') as f:
            f.write('# guard')
        g('add', 'scripts/guard.py'); g('commit', '-qm', 'guard')
        g('checkout', '-q', 'main')                      # back on main: the guard is NOT on disk
        self.assertFalse(os.path.exists(os.path.join(root, 'scripts', 'guard.py')))
        self.assertTrue(guard_exists(root, 'feat/x', 'scripts/guard.py'))
        self.assertFalse(guard_exists(root, 'main', 'scripts/guard.py'))
        self.assertFalse(guard_exists(root, 'feat/x', 'scripts/uncommitted.py'))
        with mock.patch.dict(os.environ, {'YOUCODED_WORKSPACE': root}):
            s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][2].update({'guard': 'scripts/guard.py'}), branch='feat/x')
            self.assertEqual(check_contract(s), [])
            s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][2].update({'guard': 'scripts/guard.py'}), branch='main')
            self.assertTrue(any('R3: guard scripts/guard.py is neither on disk under' in x for x in check_contract(s)))

    def test_signoff_is_the_contracts_own_answer(self):
        from deck.contract import signoff
        p = contract_spec(self.tmp); s = load_spec(p)
        ok, line = signoff(s)
        self.assertFalse(ok); self.assertIn('not signed', line)
        ap = p.replace('.json', '.answers.json')
        write_json(ap, {'deck': 'arcade-contract', 'submitted': None, 'answers': {'C': {'v': 'yes'}}})
        ok, line = signoff(s)
        self.assertFalse(ok); self.assertIn('not signed', line)             # answered but never submitted
        write_json(ap, {'deck': 'arcade-contract', 'submitted': '2026-09-01T11:00:00Z', 'answers': {'C': {'v': 'no', 'note': 'R2 is wrong'}}})
        ok, line = signoff(s)
        self.assertFalse(ok); self.assertIn('answered "no"', line); self.assertIn('R2 is wrong', line)
        write_json(ap, {'deck': 'arcade-contract', 'submitted': '2026-09-01T11:00:00Z', 'answers': {'C': {'v': 'yes'}}})
        ok, line = signoff(s)
        self.assertTrue(ok); self.assertIn('signed 2026-09-01 11:00', line)

    def test_acceptance_status(self):
        from deck.contract import acceptance_status
        p = contract_spec(self.tmp); s = load_spec(p); d = os.path.dirname(p)
        acc_path = os.path.join(d, 'arcade.contract.acceptance.json')
        ok, line = acceptance_status(s)
        self.assertFalse(ok); self.assertIn('acceptance deck not built', line)
        # A corrupt acceptance file is a different problem than "built but not yet submitted" —
        # the message must name the real cause instead of assuming the file was never touched.
        with open(acc_path, 'w') as f:
            f.write('{not valid json')
        ok, line = acceptance_status(s)
        self.assertFalse(ok); self.assertIn('unreadable', line)
        write_json(acc_path, {'key': 'x', 'steps': []})
        ok, line = acceptance_status(s)
        self.assertFalse(ok); self.assertIn('acceptance deck not submitted', line)
        write_json(os.path.join(d, 'arcade.contract.acceptance.answers.json'), {'submitted': '2026-09-01T12:00:00Z', 'answers': {'C': {'v': 'yes'}}})
        ok, line = acceptance_status(s)
        self.assertTrue(ok); self.assertIn('acceptance deck submitted 2026-09-01 12:00', line)

    def test_cli_contract_check(self):
        import importlib.util
        spec_ = importlib.util.spec_from_file_location('review_cards', os.path.join(os.path.dirname(HERE), 'review-cards.py'))
        rc = importlib.util.module_from_spec(spec_); spec_.loader.exec_module(rc)
        import io
        from contextlib import redirect_stderr, redirect_stdout
        p = contract_spec(self.tmp)
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = rc.main(['contract-check', p])
        self.assertEqual(code, 0, err.getvalue())
        lines = out.getvalue().splitlines()
        self.assertTrue(lines[0].startswith('ok: contract holds: 3 rows'), lines)
        self.assertTrue(lines[1].startswith('todo: not signed'), lines)
        self.assertTrue(lines[2].startswith('todo: acceptance deck not built'), lines)
        # A source problem is exit 1 with the problems on stderr and nothing on stdout.
        ap = os.path.join(os.path.dirname(p), 'r1.answers.json')
        a = read_json(ap); a['submitted'] = None; write_json(ap, a)
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = rc.main(['contract-check', p])
        self.assertEqual(code, 1); self.assertIn('never submitted', err.getvalue()); self.assertEqual(out.getvalue(), '')

    def test_cli_contract_check_malformed_contract_is_not_a_traceback(self):
        # Fix: a row with no `id` used to reach check_contract() (which assumes a well-formed
        # spec) and raise KeyError — close-out.sh printed that under "contract does not hold",
        # a misleading error. contract-check now validates first, same as build().
        import importlib.util
        spec_ = importlib.util.spec_from_file_location('review_cards', os.path.join(os.path.dirname(HERE), 'review-cards.py'))
        rc = importlib.util.module_from_spec(spec_); spec_.loader.exec_module(rc)
        import io
        from contextlib import redirect_stderr, redirect_stdout
        p = contract_spec(self.tmp)
        with open(p) as f:
            raw = json.load(f)
        del raw['steps'][0]['rows'][0]['id']
        with open(p, 'w') as f:
            json.dump(raw, f)
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = rc.main(['contract-check', p])
        self.assertEqual(code, 1)
        self.assertIn('has no id', err.getvalue())
        self.assertNotIn('Traceback', err.getvalue())
        self.assertEqual(out.getvalue(), '')


class AcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_refuses_without_verdicts_for_graded_rows(self):
        from deck.contract import acceptance_spec, AcceptanceError
        s = load_spec(contract_spec(self.tmp))
        with self.assertRaises(AcceptanceError) as cm:
            acceptance_spec(s, {'R1': {'verdict': 'pass', 'evidence': 'answered a'}})
        self.assertIn('R3 (mechanical) has no verdict', str(cm.exception))

    def test_builds_the_acceptance_deck(self):
        from deck.contract import acceptance_spec
        s = load_spec(contract_spec(self.tmp))
        acc = acceptance_spec(s, {'R1': {'verdict': 'pass', 'evidence': 'answered a'},
                                  'R3': {'verdict': 'fail', 'evidence': 'test_contract.py: 1 failed'}})
        self.assertEqual(acc['key'], 'arcade-contract-acceptance')
        self.assertEqual([st['id'] for st in acc['steps']], ['C', 'R2'])
        c, r2 = acc['steps']
        self.assertEqual([r.get('verdict') for r in c['rows']], ['pass', None, 'fail'])
        self.assertTrue(r2['words']); self.assertEqual((r2['yes'], r2['no']), ('Holds', 'Fails'))
        self.assertEqual(r2['headline'], "A second player's board is tellable from mine at a glance.")
        self.assertIn('band could be thinner', r2['changed'])
        # It is itself a valid deck.
        d = os.path.dirname(contract_spec(self.tmp))
        ap = os.path.join(d, 'arcade.contract.acceptance.json'); write_json(ap, acc)
        self.assertEqual(validate(load_spec(ap))[0], [])


class ReviewSourcedRowTests(unittest.TestCase):
    """Rows whose source is an ACCEPTED finding in a review file (feature-flow design §8e): the
    code reviewer's and UX tester's accepted findings become contract rows so the acceptance
    deck shows them, marked as found in review rather than approved on a deck Destin saw."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.review = os.path.join(self.tmp, 'deck', '2026-09-10-arcade-code-review.md')

    def write_review(self, body):
        os.makedirs(os.path.dirname(self.review), exist_ok=True)
        with open(self.review, 'w') as f:
            f.write(body)

    def with_review_row(self, source='review:2026-09-10-arcade-code-review.md#F2', checked_by='human', **extra):
        def mutate(raw):
            raw['steps'][0]['rows'].append({'id': 'R9', 'statement': 'Closing the board never leaves a stale invite.',
                                            'checkedBy': checked_by, 'threshold': 'pass/fail', 'source': source, **extra})
        return spec_with(self.tmp, mutate)

    def test_review_source_validates_without_a_sources_entry(self):
        self.write_review('# Code review\n- F1 rejected — taste\n- F2 accepted — a stale invite survives closing the board\n')
        s = self.with_review_row()
        self.assertEqual([e for e in errs(s) if 'R9' in e], [])
        from deck.contract import check_contract
        self.assertEqual([p for p in check_contract(s) if 'R9' in p], [])

    def test_missing_review_file_and_unknown_or_rejected_finding_are_reported(self):
        from deck.contract import check_contract
        s = self.with_review_row()
        self.assertTrue(any('R9' in p and 'cannot read' in p for p in check_contract(s)))
        self.write_review('- F1 rejected — taste\n- F2 rejected — not a bug\n')
        self.assertTrue(any('R9' in p and 'F2' in p and 'not accepted' in p for p in check_contract(s)))
        s = self.with_review_row(source='review:2026-09-10-arcade-code-review.md#F7')
        self.assertTrue(any('R9' in p and 'no finding "F7"' in p for p in check_contract(s)))
        # Review F4: an id that is on a line but unmarked is "not marked", never "no finding";
        # bold ids, a trailing colon and a capitalised verdict all still resolve.
        self.write_review('- F2 — deck/contract.py:40 — raw finding, not triaged yet\n')
        s = self.with_review_row()
        self.assertTrue(any('R9' in p and 'F2' in p and 'not marked' in p for p in check_contract(s)))
        self.write_review('- **F2**: Accepted — bold id, colon, capital verdict\n')
        self.assertEqual([p for p in check_contract(s) if 'R9' in p], [])

    def test_acceptance_deck_marks_review_rows(self):
        from deck.contract import acceptance_spec
        self.write_review('- F2 accepted — a stale invite survives closing the board\n')
        s = self.with_review_row()
        acc = acceptance_spec(s, {'R1': {'verdict': 'pass', 'evidence': 'shot'}, 'R3': {'verdict': 'pass', 'evidence': 'ran'}})
        table = acc['steps'][0]
        found = {r['id']: r.get('found') for r in table['rows']}
        self.assertEqual(found['R9'], 'review')
        self.assertIsNone(found['R1'])
        human = [st for st in acc['steps'][1:] if st['id'] == 'R9'][0]
        self.assertIn('review', human['changed'].lower())
        # The tag must survive into the page data (ROW_KEYS), or page.js can never show it.
        ap = os.path.join(self.tmp, 'deck', 'arcade.contract.acceptance.json')
        write_json(ap, acc)
        self.assertEqual(deck_data(load_spec(ap), {})['steps'][0]['rows'][-1]['found'], 'review')


if __name__ == '__main__':
    unittest.main()
