import json, os, shutil, subprocess, sys, tempfile, unittest, wave
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

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)  # clean up the rendered wav/sfx/grid.json fixture

    def test_grid_shape(self):
        g = self.grid
        self.assertEqual(g["bpm"], 118)
        self.assertEqual(g["bars"], 34)
        self.assertAlmostEqual(g["bar_seconds"], 240 / 118, places=4)
        self.assertEqual(len(g["beats"]), 34 * 4)
        # The 2026-09-03 re-planned storyboard, pinned as (name, start bar): the video timeline reads
        # these from the grid JSON, so a moved boundary here is a moved cut in the video. Bar 23
        # (drop 2) must never move — the theme flip lands on it.
        STORYBOARD = [("intro", 0), ("drop1", 2), ("groove", 5), ("hook", 8), ("break", 14), ("build", 16),
                      ("groove2", 18), ("drop2", 23), ("outro", 29), ("end", 33)]
        self.assertEqual([(s["name"], s["bar"]) for s in g["sections"]], STORYBOARD)
        self.assertEqual([s["t"] for s in g["sections"]], [b * g["bar_seconds"] for _, b in STORYBOARD])

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
        self.assertLess(rms(14, 16), rms(2, 4) * 0.8)      # the break drops the drums
        self.assertGreater(rms(14, 16), rms(2, 4) * 0.18)  # ...but never more than ~15 dB under (the lift pass)

    def test_gap_before_drop2_is_silent(self):
        g = self.grid; bar = g["bar_seconds"]
        with wave.open(self.wav) as w:
            d = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float) / 32767
        rms = lambda a, b: np.sqrt(np.mean(d[int(a * 44100 * 2):int(b * 44100 * 2)] ** 2))
        gap_start, drop_start = (22 + 14 / 16) * bar, 23 * bar
        # The gap window is NOT literally all-zero on the rendered wav: the bars-21-22 riser (spec:
        # docs/active/specs/2026-09-03-promo-video-design.md, "21-22 | Groove continues, riser") is
        # designed to swell right up to the drop and is intentionally still sounding here — measured
        # ~0.048 RMS on its own, which the spec's original "silent except the riser tail" comment
        # already called out. 0.08 sits comfortably above that riser-only floor but well below the
        # ~0.18 a real regression (e.g. drums/pad left unmuted) produces, so it still catches a broken
        # or reverted gap. The exact per-track claim (every non-riser track truly zero, pad included)
        # is pinned precisely below, on the dry buffers, since the riser swamps that difference here.
        self.assertLess(rms(gap_start, drop_start), 0.08)
        self.assertGreater(rms(drop_start, drop_start + 0.03), 0.1)  # drop 2 lands right after

        sys.path.insert(0, HERE)
        import song as M
        s = M.promo_track()
        gf, gt = s.at(22, 14), s.at(23, 0)
        for name in ("kick", "snare", "clap", "hat", "bass", "arp", "lead", "pad"):
            self.assertTrue(np.all(s.tracks[name][gf:gt] == 0), f"{name} is not silent in the gap")

    def test_sfx_exist(self):
        for name in ("pop", "whoosh", "chime"):
            p = os.path.join(self.tmp, f"sfx-{name}.wav")
            self.assertTrue(os.path.exists(p), p)
            with wave.open(p) as w:
                self.assertLess(w.getnframes() / w.getframerate(), 2.0)

if __name__ == "__main__":
    unittest.main()
