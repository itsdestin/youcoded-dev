import json, os, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from fixture import make_fixture
from deck.spec import load_spec
from deck.crops import crop_images, image_name, measure_key, newest_manifest_entry

class CropTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); self.spec = load_spec(make_fixture(self.tmp)); self.r = crop_images(self.spec, log=lambda *a: None)
        self.images = os.path.join(self.spec['_base'], 'images')
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
    def test_missing_measurement_names_the_fix(self):
        self.spec['steps'][1]['highlight'] = {'selector': '#nope'}
        r = crop_images(self.spec, log=lambda *a: None)
        self.assertTrue(any('"measure": ["#nope"]' in m and 'plans/main.json' in m for m in r['missing']))
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

if __name__ == '__main__': unittest.main()
