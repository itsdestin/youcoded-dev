import os, subprocess, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from deck.boxes import parse_geometry, rect_to_pct, diff_bbox, image_size, px_to_pct

class GeometryTests(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(parse_geometry('440x600+500+150'), (440, 600, 500, 150))
        with self.assertRaises(ValueError): parse_geometry('440x600')
    def test_rect_inside_crop(self):
        # crop is 400x200 at (100, 50); element at window (200, 100) 100x50 → 25%, 25%, 25%, 25%
        self.assertEqual(rect_to_pct({'x': 200, 'y': 100, 'w': 100, 'h': 50}, '400x200+100+50'), [25.0, 25.0, 25.0, 25.0])
    def test_rect_partly_outside_is_clipped(self):
        self.assertEqual(rect_to_pct({'x': 0, 'y': 0, 'w': 200, 'h': 100}, '400x200+100+50'), [0.0, 0.0, 25.0, 25.0])
    def test_rect_fully_outside_is_none(self):
        self.assertIsNone(rect_to_pct({'x': 900, 'y': 900, 'w': 10, 'h': 10}, '400x200+100+50'))
    def test_px_to_pct(self):
        self.assertEqual(px_to_pct({'x': 50, 'y': 20, 'w': 100, 'h': 40}, (200, 80)), [25.0, 25.0, 50.0, 50.0])

class DiffTests(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp(); self.a = os.path.join(self.d, 'a.png'); self.b = os.path.join(self.d, 'b.png')
        subprocess.run(['magick', '-size', '200x100', 'xc:#333333', self.a], check=True)
        subprocess.run(['magick', self.a, '-fill', 'red', '-draw', 'rectangle 50,20 89,49', self.b], check=True)
    def test_size(self): self.assertEqual(image_size(self.a), (200, 100))
    def test_identical_images_have_no_box(self): self.assertIsNone(diff_bbox(self.a, self.a))
    def test_changed_rectangle_is_found_with_padding(self):
        box = diff_bbox(self.a, self.b)
        self.assertIsNotNone(box)
        # contains the 40x30 rectangle at (50,20) and is padded, but not by much
        self.assertLessEqual(box['x'], 50); self.assertLessEqual(box['y'], 20)
        self.assertGreaterEqual(box['x'] + box['w'], 90); self.assertGreaterEqual(box['y'] + box['h'], 50)
        self.assertGreaterEqual(box['x'], 40); self.assertGreaterEqual(box['y'], 10)
        self.assertLessEqual(box['w'], 62); self.assertLessEqual(box['h'], 52)
    def test_box_never_leaves_the_image(self):
        c = os.path.join(self.d, 'c.png'); subprocess.run(['magick', self.a, '-fill', 'red', '-draw', 'rectangle 0,0 9,9', c], check=True)
        box = diff_bbox(self.a, c); self.assertEqual((box['x'], box['y']), (0, 0))

if __name__ == '__main__': unittest.main()
