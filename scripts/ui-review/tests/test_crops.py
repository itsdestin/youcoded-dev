import json, os, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from fixture import make_fixture, shoot_run
from deck.spec import load_spec
from deck.crops import crop_images, image_name, measure_key, newest_manifest_entry

class CropTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); self.spec = load_spec(make_fixture(self.tmp)); self.r = crop_images(self.spec, log=lambda *a: None)
        self.images = os.path.join(self.spec['_base'], 'images', 'deck')
    def test_every_theme_and_run_is_cut_once(self):
        self.assertEqual(self.r['count'], 1 * 2 * 2)   # crops × themes × runs — S-1..3 share crop "c", so 4 files, not 12
        self.assertTrue(os.path.exists(os.path.join(self.images, image_name('c', 'light', 'after'))))
        self.assertEqual(sorted(os.listdir(self.images)), sorted(image_name('c', t, r) for t in ('midnight', 'light') for r in ('before', 'after')))
    def test_measured_selector_maps_into_the_crop(self):
        # crop is 400x200 at (500,250); #send at (600,300) 80x30 → 25%, 25%, 20%, 15%
        self.assertEqual(self.r['boxes']['S-2']['midnight']['before'], [25.0, 25.0, 20.0, 15.0])
        self.assertEqual(self.r['boxes']['S-3']['light']['after'], [25.0, 25.0, 20.0, 15.0])
    def test_auto_box_is_the_changed_region_inside_the_crop_only(self):
        b = self.r['boxes']['S-1']['midnight']['after']
        # red block at window (560,260) 120x40 → crop (60,10) 120x40 → 15%,5%,30%,20%; the 3x3 dilate adds 1px
        # a side and the pad 6px, so the measured box is (53,3) 134x54 → 13.25%, 1.5%, 33.5%, 27%
        self.assertAlmostEqual(b[0], 15.0, delta=2.5); self.assertAlmostEqual(b[1], 5.0, delta=4)
        self.assertAlmostEqual(b[2], 30.0, delta=5); self.assertAlmostEqual(b[3], 20.0, delta=8)
        self.assertEqual(self.r['boxes']['S-1']['midnight']['before'], b)   # same box on both pictures
        self.assertEqual(self.r['missing'], []); self.assertEqual(self.r['warnings'], [])
    def test_a_live_step_is_skipped_and_the_stills_are_still_cut(self):
        # MIXED deck (this one needs pictures, so it stays here rather than in test_live.py).
        # Without the skip, spec['_crops'][st['crop']] raises KeyError on the first live step
        # and the whole build dies before any still is cut.
        self.spec['steps'].insert(0, {
            'id': 'L-0', 'surface': 'Session strip', 'path': 'Header', 'headline': 'Which expand?',
            'live': {'surface': 'strip-expand', 'round': 1},
            'variants': [{'id': 'a', 'label': 'As built', 'candidate': 'as-built', 'summary': 'Overshoot.'},
                         {'id': 'b', 'label': 'Snappier', 'candidate': 'snappy', 'summary': 'Stops dead.'}]})
        r = crop_images(self.spec, log=lambda *a: None)
        self.assertEqual(r['missing'], [])
        self.assertEqual(r['count'], 4)          # the three still steps, sharing crop "c"
        self.assertNotIn('L-0', r['boxes'])      # a live step has no box: the pane IS the picture

    def test_missing_measurement_names_the_fix(self):
        self.spec['steps'][1]['highlight'] = {'selector': '#nope'}
        r = crop_images(self.spec, log=lambda *a: None)
        self.assertTrue(any('"measure": ["#nope"]' in m and 'plans/archive/main.json' in m for m in r['missing']))
        self.assertEqual(r['boxes']['S-2']['light'], {})
    def test_missing_capture_is_reported_not_faked(self):
        os.remove(os.path.join(self.spec['runs']['after'], 'shots-main', 'light', 'home.png'))
        r = crop_images(self.spec, log=lambda *a: None)
        self.assertTrue(any('light/after' in m and 'not captured' in m for m in r['missing']))
    def test_whole_surface_change_warns(self):
        import subprocess
        p = os.path.join(self.spec['runs']['after'], 'shots-main', 'midnight', 'home.png')
        subprocess.run(['magick', p, '-fill', 'red', '-draw', 'rectangle 500,250 899,449', p], check=True)
        r = crop_images(self.spec, log=lambda *a: None)
        self.assertTrue(any('whole-surface change' in w for w in r['warnings']))
    def test_newest_manifest_entry(self):
        e = newest_manifest_entry(self.spec['runs']['before'], 'main', 'home', 'light')
        self.assertEqual(e['measures']['#send']['x'], 600); self.assertIsNone(newest_manifest_entry(self.spec['runs']['before'], 'main', 'nope', 'light'))
    def test_newest_run_id_beats_a_later_file_time(self):
        # An earlier sweep's shard can finish (and write its manifest) AFTER a newer sweep's — the run id decides, not mtime.
        import time
        d = os.path.join(self.spec['runs']['before'], 'shots-main')
        json.dump([{'name': 'home', 'theme': 'light', 'verified': True, 'run': '2', 'measures': {'#send': {'x': 1, 'y': 1, 'w': 1, 'h': 1}}}], open(os.path.join(d, 'manifest-main-newer-run.json'), 'w'))
        old = os.path.join(d, 'manifest-main-x.json'); os.utime(old, (time.time() + 60, time.time() + 60))   # the run-'1' file is now the newest on disk
        self.assertEqual(newest_manifest_entry(self.spec['runs']['before'], 'main', 'home', 'light')['measures']['#send']['x'], 1)
    def test_measure_key(self):
        self.assertEqual(measure_key({'selector': '#a'}), '#a'); self.assertEqual(measure_key({'text': 'Send'}), 'text:Send')


# A picture in PIXELS on a 1440x900 shoot picture, and its percent equivalent (px_to_pct, 2dp).
PANEL = {'x': 500, 'y': 250, 'w': 400, 'h': 200}
PANEL_PCT = [34.72, 27.78, 27.78, 22.22]


def _shoot_spec(tmp, step_over=None, **over):
    """A one-step deck whose crop names a SHOOT SCREEN ("settings/sound") rather than a legacy
    crops.json name — the shape this whole test class exists to cover."""
    deck = os.path.join(tmp, 'deck'); os.makedirs(deck, exist_ok=True)
    step = {'id': 'S-1', 'surface': 'Settings', 'path': 'Sound', 'crop': 'settings/sound',
            'headline': 'A shoot screen shows here.', 'changed': 'x', 'notice': 'y'}
    step.update(step_over or {})
    spec = {'title': 'Shoot fixture', 'key': 'shoot-fixture', 'out': 'shoot.html',
            'images': 'images/shoot', 'themes': ['midnight', 'light'],
            'runs': {'before': os.path.join(tmp, 'runs', 'before'), 'after': os.path.join(tmp, 'runs', 'after')},
            'steps': [step]}
    spec.update(over)
    p = os.path.join(deck, 'shoot.json'); json.dump(spec, open(p, 'w'), indent=1)
    return p


class ShootCropTests(unittest.TestCase):
    """A step names a shoot SCREEN ("settings/sound") instead of a legacy crops.json name —
    resolved against the run's OWN manifest.json (shoot's output shape: one whole picture per
    screen × theme, never a sub-crop), with the screen's panel as the default highlight."""
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        # 'before' has no red block; 'after' does — the same before/after pattern make_runs.py
        # uses, so "auto" has something real to find, just against the WHOLE picture this time.
        for run, rect in (('before', None), ('after', (560, 260, 120, 40))):
            shoot_run(os.path.join(self.tmp, 'runs', run),
                     [{'name': 'settings/sound', 'theme': t, 'panel': PANEL, 'rect': rect} for t in ('midnight', 'light')])

    def test_the_whole_picture_is_copied_never_a_sub_crop(self):
        from deck.boxes import image_size
        spec = load_spec(_shoot_spec(self.tmp))
        r = crop_images(spec, log=lambda *a: None)
        self.assertEqual(r['missing'], [])
        dst = os.path.join(spec['_base'], 'images', 'shoot', image_name('settings/sound', 'midnight', 'before'))
        self.assertTrue(os.path.exists(dst))
        self.assertEqual(image_size(dst), (1440, 900))

    def test_auto_diff_still_works_across_two_shoot_pictures(self):
        spec = load_spec(_shoot_spec(self.tmp))
        r = crop_images(spec, log=lambda *a: None)
        self.assertEqual(r['missing'], []); self.assertEqual(r['warnings'], [])
        # Both runs get the SAME box (the change, found by diffing the two whole pictures) —
        # identical to a legacy "auto" pair, just with no sub-crop geometry in the middle.
        self.assertEqual(r['boxes']['S-1']['midnight']['before'], r['boxes']['S-1']['midnight']['after'])
        b = r['boxes']['S-1']['midnight']['after']
        self.assertAlmostEqual(b[0], 560 / 1440 * 100, delta=1); self.assertAlmostEqual(b[1], 260 / 900 * 100, delta=1)

    def test_a_single_run_shoot_screen_defaults_to_its_own_panel(self):
        spec = load_spec(_shoot_spec(self.tmp, runs={'today': os.path.join(self.tmp, 'runs', 'before')}))
        r = crop_images(spec, log=lambda *a: None)
        self.assertEqual(r['missing'], [])
        self.assertEqual(r['boxes']['S-1']['midnight']['today'], PANEL_PCT)

    def test_a_named_element_highlight_is_refused_on_a_shoot_crop(self):
        # Shoot names screens, not elements — there is no "measures" dict to look a selector or
        # text up in, ever, so this is refused rather than silently boxing nothing.
        spec = load_spec(_shoot_spec(self.tmp, step_over={'highlight': {'selector': '#nope'}}))
        r = crop_images(spec, log=lambda *a: None)
        self.assertTrue(any('names a screen, not an element' in m for m in r['missing']), r['missing'])
        self.assertEqual(r['boxes']['S-1']['midnight'], {})

    def test_a_hand_placed_box_still_works_on_a_shoot_crop(self):
        spec = load_spec(_shoot_spec(self.tmp, step_over={'highlight': {'box': [1, 2, 3, 4]}}))
        r = crop_images(spec, log=lambda *a: None)
        self.assertEqual(r['boxes']['S-1']['midnight']['before'], [1, 2, 3, 4])
        self.assertEqual(r['boxes']['S-1']['midnight']['after'], [1, 2, 3, 4])

    def test_a_picture_shoot_marked_not_ok_is_missing_never_blank(self):
        shoot_run(os.path.join(self.tmp, 'runs', 'before'),
                 [{'name': 'settings/sound', 'theme': t, 'ok': False, 'reason': 'its mark is not on the page'} for t in ('midnight', 'light')])
        spec = load_spec(_shoot_spec(self.tmp))
        r = crop_images(spec, log=lambda *a: None)
        self.assertTrue(any('its mark is not on the page' in m for m in r['missing']), r['missing'])
        self.assertEqual(r['boxes']['S-1']['midnight'].get('before'), None)

    def test_a_name_that_is_neither_legacy_nor_in_a_shoot_run_is_missing_not_a_crash(self):
        # 'today' points at a plain empty folder: no shots-<plan>/ (legacy) and no manifest.json
        # (shoot) — never a KeyError, always a clear, refused "missing".
        empty = os.path.join(self.tmp, 'runs', 'empty'); os.makedirs(empty, exist_ok=True)
        spec = load_spec(_shoot_spec(self.tmp, runs={'today': empty}))
        r = crop_images(spec, log=lambda *a: None)
        self.assertTrue(any('not a shoot run' in m and 'not a name in crops.json either' in m for m in r['missing']), r['missing'])

    def test_a_choice_step_may_mix_a_shoot_variant_with_a_legacy_one(self):
        # The mode is decided PER VARIANT, not per step or per deck — a choice step comparing an
        # old design against a real shoot-captured screen is a legitimate single ask. Both read
        # from the SAME run folder: it is shoot-shaped (has manifest.json) for "settings/sound",
        # and also holds an old-shaped shots-main/ folder for the legacy "c" crop.
        run_dir = os.path.join(self.tmp, 'runs', 'before')   # already shoot-shaped from setUp
        from deck.fixture.make_runs import make_runs
        legacy = make_runs(os.path.join(self.tmp, 'legacy-src'), themes=('midnight',), runs=('only',))['only']
        import shutil as _shutil
        _shutil.copytree(os.path.join(legacy, 'shots-main'), os.path.join(run_dir, 'shots-main'))

        deck = os.path.join(self.tmp, 'deck2'); os.makedirs(deck, exist_ok=True)
        spec = {'title': 'Mixed choice', 'key': 'mixed-choice', 'out': 'mixed.html',
                'images': 'images/mixed', 'themes': ['midnight'],
                'runs': {'today': run_dir},
                'crops': {'c': ['main', 'home', '400x200+500+250']},
                'steps': [{'id': 'C-1', 'surface': 'Settings', 'path': 'Sound', 'headline': 'Which?',
                          'variants': [{'id': 'a', 'label': 'Shoot', 'crop': 'settings/sound', 'summary': 'x'},
                                       {'id': 'b', 'label': 'Legacy', 'crop': 'c', 'summary': 'y'}]}]}
        p = os.path.join(deck, 'mixed.json'); json.dump(spec, open(p, 'w'))
        spec = load_spec(p)
        r = crop_images(spec, log=lambda *a: None)
        self.assertEqual(r['missing'], [])
        out = os.path.join(spec['_base'], 'images', 'mixed')
        self.assertTrue(os.path.exists(os.path.join(out, image_name('settings/sound', 'midnight', 'today'))))
        self.assertTrue(os.path.exists(os.path.join(out, image_name('c', 'midnight', 'today'))))


if __name__ == '__main__': unittest.main()
