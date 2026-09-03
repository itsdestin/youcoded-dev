"""Live panes: validation, the pane address, picture-free decks, and serve's port guard.

WHY this is one module rather than cases spread through test_spec/test_crops/test_build/
test_serve: every one of those builds real crops with ImageMagick in setUp, which the CI
runner does not have. Everything here is picture-free on purpose, so this is the deck
coverage that actually runs on every push. Keep it that way — a `magick` call added to this
file silently removes it from CI.

Plan: docs/archive/plans/2026-08-31-live-review-panes-plan.md.
"""
import json
import os
import re
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
from fixture import live_spec                                                    # noqa: E402
from deck.build import build_page, deck_data                                     # noqa: E402
from deck.crops import crop_images                                               # noqa: E402
from deck.live import LIVE_OFFSET, PANE_WIDTH, all_live, is_live, live_base, pane_url   # noqa: E402
from deck.spec import SpecError, load_spec, validate                             # noqa: E402


def spec_with(tmp, mutate, **over):
    """Load the live fixture after mutating it, so each case edits one thing."""
    p = live_spec(tmp, **over)
    with open(p) as f:
        raw = json.load(f)
    mutate(raw)
    with open(p, 'w') as f:
        json.dump(raw, f)
    return load_spec(p)


def errs(spec):
    return validate(spec)[0]


def warns(spec):
    return validate(spec)[1]


class AddressTests(unittest.TestCase):
    """The address is the entire join between the two repos, so it is worth pinning exactly."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.spec = load_spec(live_spec(self.tmp))

    def test_default_port_is_clear_of_the_other_rigs(self):
        # run-dev 50, run-workbench 60, record-pair/run-review 300 — a deck must be servable
        # while any of them is up.
        self.assertNotIn(LIVE_OFFSET, (50, 60, 300))
        self.assertEqual(live_base({'live': {}}), 'http://127.0.0.1:%d' % (5173 + LIVE_OFFSET))

    def test_explicit_base_beats_the_offset(self):
        self.assertEqual(live_base({'live': {'base': 'http://127.0.0.1:41234/'}}), 'http://127.0.0.1:41234')

    def test_url_carries_child_round_and_candidate(self):
        u = pane_url(self.spec, {'surface': 'strip-expand', 'round': 1}, 'as-built', 'midnight')
        for want in ('mode=workbench', 'child=1', 'view=live', 'surface=strip-expand',
                     'round=1', 'candidate=as-built', 'theme=midnight'):
            self.assertIn(want, u, want)

    def test_round_is_always_in_the_address(self):
        # Candidate ids are unique only WITHIN a round (close-prompt-body reuses 'labelled'
        # and 'one-line' across its ten), so an address without one shows the wrong design.
        for st in self.spec['steps']:
            for pane in deck_data(self.spec, {})['steps'][self.spec['steps'].index(st)]['panes']:
                self.assertIn('round=%s' % st['live']['round'], pane['url'])


class PictureFreeDeckTests(unittest.TestCase):
    """A deck of nothing but live steps names no images folder and no runs. Three separate
    call sites used to reach for spec['images'] unconditionally."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.spec = load_spec(live_spec(self.tmp))

    def test_loads_without_images_or_runs(self):
        self.assertTrue(all_live(self.spec))
        self.assertNotIn('images', self.spec)
        self.assertEqual(list(self.spec['runs']), ['today'])

    def test_validates_clean(self):
        self.assertEqual(errs(self.spec), [])

    def test_crop_images_cuts_nothing_and_reports_nothing_missing(self):
        r = crop_images(self.spec, log=lambda m: None)
        self.assertEqual(r['count'], 0)
        self.assertEqual(r['missing'], [])

    def test_build_page_writes_a_page_whose_deck_is_live(self):
        page, _ = build_page(self.spec, {})
        blob = re.search(r'const DECK=(\{.*?\});', page, re.S).group(1).replace('<\\/', '</')
        data = json.loads(blob)
        self.assertEqual([st['kind'] for st in data['steps']], ['live', 'live'])
        self.assertIn('view=live', data['steps'][0]['panes'][0]['url'])

    def test_a_deck_that_is_not_all_live_still_demands_images(self):
        p = live_spec(self.tmp)
        with open(p) as f:
            raw = json.load(f)
        raw['steps'].append({'id': 'S-1', 'surface': 'Home', 'path': 'Chat', 'crop': 'c',
                             'headline': 'A still.', 'changed': 'x', 'notice': 'y'})
        with open(p, 'w') as f:
            json.dump(raw, f)
        with self.assertRaises(SpecError) as cm:
            load_spec(p)
        self.assertIn('images', str(cm.exception))


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.spec = load_spec(live_spec(self.tmp))
        self.data = deck_data(self.spec, {})

    def test_pick_one_gets_a_pane_per_variant_try_this_gets_one(self):
        self.assertEqual(len(self.data['steps'][0]['panes']), 2)
        self.assertEqual(len(self.data['steps'][1]['panes']), 1)

    def test_every_pane_carries_the_url_the_popout_opens(self):
        for st in self.data['steps']:
            for pane in st['panes']:
                self.assertTrue(pane['url'].startswith('http://'))
                self.assertIn('view=live', pane['url'])

    def test_panes_open_on_the_decks_first_theme(self):
        self.assertIn('theme=midnight', self.data['steps'][0]['panes'][0]['url'])

    def test_a_live_step_looks_up_no_images(self):
        for st in self.data['steps']:
            self.assertNotIn('images', st)
            self.assertEqual(st['kind'], 'live')

    def test_deck_carries_the_base_and_the_command_to_start_it(self):
        self.assertEqual(self.data['live']['base'], live_base(self.spec))
        self.assertIn('run-workbench.sh', self.data['live']['command'])
        self.assertIn('live-tree', self.data['live']['command'])

    def test_width_falls_back_to_the_routes_own_default(self):
        self.assertEqual(self.data['steps'][0]['width'], PANE_WIDTH)


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_live_needs_surface_and_round(self):
        for missing in ('surface', 'round'):
            spec = spec_with(self.tmp, lambda r, m=missing: r['steps'][0]['live'].pop(m))
            self.assertTrue(any(f'live is missing {missing}' in e for e in errs(spec)), missing)

    def test_a_live_step_refuses_every_picture_field(self):
        for field, value in (('crop', 'c'), ('clip', 'blink'),
                             ('highlight', {'selector': '#x'}), ('options', [{'id': 'a'}])):
            spec = spec_with(self.tmp, lambda r, f=field, v=value: r['steps'][0].update({f: v}))
            self.assertTrue(any(f'no {field}' in e for e in errs(spec)), field)

    def test_a_variant_needs_a_candidate(self):
        spec = spec_with(self.tmp, lambda r: r['steps'][0]['variants'][0].pop('candidate'))
        self.assertTrue(any('missing candidate' in e for e in errs(spec)))

    def test_a_variant_may_not_carry_a_crop(self):
        spec = spec_with(self.tmp, lambda r: r['steps'][0]['variants'][0].update({'crop': 'c'}))
        self.assertTrue(any('no crop' in e for e in errs(spec)))

    def test_pane_count_is_bounded_at_both_ends(self):
        one = spec_with(self.tmp, lambda r: r['steps'][0].update({'variants': r['steps'][0]['variants'][:1]}))
        self.assertTrue(any('2 to 4 variants' in e for e in errs(one)))
        five = spec_with(self.tmp, lambda r: r['steps'][0].update({'variants': [
            {'id': c, 'label': c, 'candidate': c, 'summary': 's'} for c in 'abcde']}))
        self.assertTrue(any('2 to 4 variants' in e for e in errs(five)))

    def test_a_try_this_needs_candidate_changed_and_notice(self):
        spec = spec_with(self.tmp, lambda r: r['steps'][1]['live'].pop('candidate'))
        self.assertTrue(any('live is missing candidate' in e for e in errs(spec)))
        for field in ('changed', 'notice'):
            spec = spec_with(self.tmp, lambda r, f=field: r['steps'][1].pop(f))
            self.assertTrue(any(f'missing {field}' in e for e in errs(spec)), field)

    def test_the_deck_needs_a_worktree(self):
        spec = spec_with(self.tmp, lambda r: r['live'].pop('worktree'))
        self.assertTrue(any('worktree' in e for e in errs(spec)))

    def test_headline_cap_and_banned_words_still_apply(self):
        spec = spec_with(self.tmp, lambda r: r['steps'][0].update({'headline': 'word ' * 30}))
        self.assertTrue(any('headline is' in e for e in errs(spec)))
        spec = spec_with(self.tmp, lambda r: r['steps'][1].update({'notice': 'The reducer changes.'}))
        self.assertTrue(any('banned word' in e for e in errs(spec)))

    def test_panes_that_will_not_fit_are_a_warning_not_an_error(self):
        wide = spec_with(self.tmp, lambda r: (
            r['steps'][0]['live'].update({'paneWidth': 900}),
            r['steps'][1]['live'].update({'paneWidth': 900})))
        self.assertEqual(errs(wide), [])
        self.assertTrue(any('will not fit side by side' in w for w in warns(wide)))

    def test_a_live_pick_one_is_also_a_choice_step_so_live_must_be_checked_first(self):
        # THE hazard, stated out loud: a live pick-one carries `variants`, so is_choice() is
        # TRUE for it. Every dispatcher (validate, crop_images, deck_data, build_page) must
        # therefore ask is_live FIRST — crop_images did not, and died on the crop those
        # variants deliberately lack. Guarded end-to-end by test_crops' mixed-deck case.
        from deck.spec import is_choice
        spec = load_spec(live_spec(self.tmp))
        self.assertTrue(is_live(spec['steps'][0]))
        self.assertTrue(is_choice(spec['steps'][0]), 'a live pick-one looks like a choice step')
        self.assertEqual(errs(spec), [])


class ServeGuardTests(unittest.TestCase):
    """serve boots the worktree's workbench — but never over a foreign one."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.spec = load_spec(live_spec(self.tmp))

    def test_an_unknown_worktree_is_refused_by_name(self):
        from deck.serve import start_workbench
        with self.assertRaises(SpecError) as cm:
            start_workbench(self.spec, log=lambda m: None)
        self.assertIn('live-tree', str(cm.exception))
        self.assertIn('desktop/', str(cm.exception))

    def test_a_foreign_server_on_the_port_is_refused_with_both_paths(self):
        from fixture import LivePaneServer
        from deck import serve as serve_mod
        stub = LivePaneServer()
        self.addCleanup(stub.stop)
        tree = os.path.join(self.tmp, 'live-tree')
        os.makedirs(os.path.join(tree, 'desktop'), exist_ok=True)
        real_resolve, real_listener = serve_mod.resolve_worktree, serve_mod._listener_cwd
        serve_mod.resolve_worktree = lambda name: tree
        serve_mod._listener_cwd = lambda port: (4242, '/somewhere/else/desktop')
        self.addCleanup(lambda: (setattr(serve_mod, 'resolve_worktree', real_resolve),
                                 setattr(serve_mod, '_listener_cwd', real_listener)))
        with self.assertRaises(SpecError) as cm:
            serve_mod.start_workbench(self.spec, log=lambda m: None)
        msg = str(cm.exception)
        self.assertIn('REFUSING', msg)
        self.assertIn('/somewhere/else/desktop', msg)      # what IS there
        self.assertIn(os.path.join(tree, 'desktop'), msg)  # what SHOULD be
        self.assertIn('offset', msg)                       # and the way out

    def test_a_server_already_serving_this_tree_is_left_alone(self):
        from deck import serve as serve_mod
        tree = os.path.join(self.tmp, 'live-tree')
        os.makedirs(os.path.join(tree, 'desktop'), exist_ok=True)
        real_resolve, real_listener = serve_mod.resolve_worktree, serve_mod._listener_cwd
        serve_mod.resolve_worktree = lambda name: tree
        serve_mod._listener_cwd = lambda port: (4242, os.path.join(tree, 'desktop'))
        self.addCleanup(lambda: (setattr(serve_mod, 'resolve_worktree', real_resolve),
                                 setattr(serve_mod, '_listener_cwd', real_listener)))
        proc, started = serve_mod.start_workbench(self.spec, log=lambda m: None)
        self.assertIsNone(proc)
        self.assertFalse(started)   # not ours, so serve() must not stop it on exit


if __name__ == '__main__':
    unittest.main()
