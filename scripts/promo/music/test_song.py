import json, os, subprocess, sys, tempfile, unittest, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))

class PromoTrack(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.wav = os.path.join(cls.tmp, "promo.wav")
        subprocess.run([sys.executable, os.path.join(HERE, "song.py"), "promo", cls.wav], check=True, cwd=HERE)
        with open(os.path.join(cls.tmp, "promo.grid.json")) as f:
            cls.grid = json.load(f)

    def test_grid_shape(self):
        g = self.grid
        self.assertEqual(g["bpm"], 118)
        self.assertEqual(g["bars"], 34)
        self.assertAlmostEqual(g["bar_seconds"], 240 / 118, places=4)
        self.assertEqual(len(g["beats"]), 34 * 4)
        self.assertEqual([s["name"] for s in g["sections"]],
                         ["intro", "drop1", "groove", "hook", "break", "build", "groove2", "drop2", "outro", "end"])
        self.assertEqual([s["bar"] for s in g["sections"]], [0, 2, 6, 10, 14, 16, 18, 23, 29, 33])

    def test_audio_is_sane(self):
        with wave.open(self.wav) as w:
            n, sr = w.getnframes(), w.getframerate()
            d = np.frombuffer(w.readframes(n), "<i2").astype(float) / 32767
        self.assertEqual(sr, 44100)
        self.assertAlmostEqual(n / sr, 34 * 240 / 118 + 2.5, delta=0.05)
        self.assertFalse(np.isnan(d).any())
        self.assertLessEqual(np.abs(d).max(), 10 ** (-1 / 20) + 1e-3)   # peak ≤ -1 dBFS
        self.assertGreater(np.abs(d).max(), 0.5)                            # not silent

    def test_break_is_quieter_than_drop(self):
        g = self.grid; bar = g["bar_seconds"]
        with wave.open(self.wav) as w:
            d = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float) / 32767
        rms = lambda a, b: np.sqrt(np.mean(d[int(a * bar * 44100 * 2):int(b * bar * 44100 * 2)] ** 2))
        self.assertLess(rms(14, 16), rms(2, 4) * 0.8)   # the break drops the drums

    def test_sfx_exist(self):
        for name in ("pop", "whoosh", "chime"):
            p = os.path.join(self.tmp, f"sfx-{name}.wav")
            self.assertTrue(os.path.exists(p), p)
            with wave.open(p) as w:
                self.assertLess(w.getnframes() / w.getframerate(), 2.0)

if __name__ == "__main__":
    unittest.main()
