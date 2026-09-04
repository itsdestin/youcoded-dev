import json, os, shutil, subprocess, sys, tempfile, unittest, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
BARS = 44

class PromoTrack(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.wav = os.path.join(cls.tmp, "promo.wav")
        subprocess.run([sys.executable, os.path.join(HERE, "song.py"), "promo", cls.wav], check=True, cwd=HERE)
        with open(os.path.join(cls.tmp, "promo.grid.json")) as f:
            cls.grid = json.load(f)
        with wave.open(cls.wav) as w:
            cls.pcm = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float) / 32767

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)  # clean up the rendered wav/sfx/grid.json fixture

    def rms_s(self, a, b):
        """RMS of the interleaved stereo pcm between seconds a and b."""
        return np.sqrt(np.mean(self.pcm[int(a * 44100 * 2):int(b * 44100 * 2)] ** 2))

    def rms_bars(self, a, b):
        bar = self.grid["bar_seconds"]
        return self.rms_s(a * bar, b * bar)

    def test_grid_shape(self):
        g = self.grid
        self.assertEqual(g["bpm"], 118)
        self.assertEqual(g["bars"], BARS)
        self.assertAlmostEqual(g["bar_seconds"], 240 / 118, places=4)
        self.assertEqual(len(g["beats"]), BARS * 4)
        # The 44-bar storyboard (re-planned 2026-09-03), pinned as (name, start bar): the video
        # timeline reads its cuts off this grid, so a moved boundary here is a moved cut in the video.
        # Bar 6 (drop 1, the theme flips) and bar 33 (drop 2, the marketplace) must never move.
        STORYBOARD = [("intro", 0), ("groove", 2), ("drop1", 6), ("groove-b", 10), ("hook", 18), ("break", 24),
                      ("build", 26), ("groove2", 28), ("drop2", 33), ("outro", 38), ("end", 43)]
        self.assertEqual([(s["name"], s["bar"]) for s in g["sections"]], STORYBOARD)
        self.assertEqual([s["t"] for s in g["sections"]], [b * g["bar_seconds"] for _, b in STORYBOARD])

    def test_audio_is_sane(self):
        with wave.open(self.wav) as w:
            n, sr = w.getnframes(), w.getframerate()
        self.assertEqual(sr, 44100)
        self.assertAlmostEqual(n / sr, BARS * 240 / 118 + 2.5, delta=0.05)
        self.assertFalse(np.isnan(self.pcm).any())
        self.assertLessEqual(np.abs(self.pcm).max(), 10 ** (-1 / 20) + 1e-3)   # peak ≤ -1 dBFS
        self.assertGreater(np.abs(self.pcm).max(), 0.5)                            # not silent

    def test_opens_with_an_impact(self):
        # Bar 0 beat 1 is the mascot's punch: the music starts from silence and the very first 30 ms
        # must already be as loud as a drop-bar downbeat, not a pad fading in. Compared against the
        # first 30 ms of drop 2 (bar 33) so the bar is "as loud as the loudest hit", not a fixed number.
        bar = self.grid["bar_seconds"]
        self.assertGreater(self.rms_s(0, 0.03), 0.6 * self.rms_s(33 * bar, 33 * bar + 0.03))
        self.assertGreater(self.rms_s(0, 0.03), 0.1)
        # ...and the intro texture after it is still lifted into audibility (LIFT_DB), not left at -32 dB.
        self.assertGreater(self.rms_bars(1, 2), self.rms_bars(6, 8) * 0.18)

    def test_break_is_quieter_than_drop(self):
        self.assertLess(self.rms_bars(24, 26), self.rms_bars(6, 8) * 0.8)      # the break drops the drums
        self.assertGreater(self.rms_bars(24, 26), self.rms_bars(6, 8) * 0.18)  # ...but never more than ~15 dB under (the lift pass)

    def test_gap_before_drop1_is_silent(self):
        bar = self.grid["bar_seconds"]
        gap_start, drop_start = (5 + 14 / 16) * bar, 6 * bar
        # The gap window is NOT literally all-zero on the rendered wav: the bar-5 riser is designed to
        # swell right up to the drop and is intentionally still sounding here — measured ~0.05 RMS on
        # its own in the 34-bar cut. 0.08 sits above that riser-only floor but well below the ~0.18 a
        # real regression (e.g. drums/pad left unmuted) produces, so it still catches a broken or
        # reverted gap. The exact per-track claim (every non-riser track truly zero, pad included) is
        # pinned precisely below, on the dry buffers, since the riser swamps that difference here.
        self.assertLess(self.rms_s(gap_start, drop_start), 0.08)
        self.assertGreater(self.rms_s(drop_start, drop_start + 0.03), 0.1)  # drop 1 lands right after

        sys.path.insert(0, HERE)
        import song as M
        s = M.promo_track()
        gf, gt = s.at(5, 14), s.at(6, 0)
        for name in ("kick", "snare", "clap", "hat", "bass", "arp", "lead", "pad"):
            self.assertTrue(np.all(s.tracks[name][gf:gt] == 0), f"{name} is not silent in the gap")
        # Drop 2 has NO gap: its fill (bar 32) runs straight into bar 33.
        self.assertGreater(self.rms_s((32 + 14 / 16) * bar, 33 * bar), 0.1)

    def test_sfx_exist_with_stated_durations(self):
        # Seconds each effect is meant to be. The video (src/beats/sfx.tsx) sizes each Sequence from
        # the file length, so a file that silently changed length would truncate or gap on screen —
        # pin them here, ±15 %.
        stated = {"pop": 0.16, "whoosh": 0.26, "chime": 1.3, "punch": 0.25, "poof": 0.35, "step": 0.08}
        for name, secs in stated.items():
            p = os.path.join(self.tmp, f"sfx-{name}.wav")
            self.assertTrue(os.path.exists(p), p)
            with wave.open(p) as w:
                self.assertEqual(w.getnchannels(), 2)
                d = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float) / 32767
                self.assertAlmostEqual(w.getnframes() / w.getframerate(), secs, delta=secs * 0.15, msg=name)
            # same level convention as the originals: peak-normalised to -3 dBFS by master()
            self.assertAlmostEqual(np.abs(d).max(), 10 ** (-3 / 20), delta=0.01, msg=name)

if __name__ == "__main__":
    unittest.main()
