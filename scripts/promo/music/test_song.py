import json, os, shutil, subprocess, sys, tempfile, unittest, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import song as M

BARS, BPM = M.BARS, M.BPM
# The 51-bar plan (2026-09-09, 120 BPM), pinned as (name, start bar): the video timeline reads its
# cuts off this grid, so a moved boundary here is a moved cut in the video. Bar 7 (drop 1, the first
# theme flip) and bar 20 (drop 2, the marketplace) must never move.
STORYBOARD = [("intro", 0), ("groove", 2), ("drop1", 7), ("groove-b", 10), ("drop2", 20), ("groove-c", 25), ("hook", 29),
              ("break", 36), ("build", 38), ("groove2", 41), ("outro", 45), ("end", 48)]


def _render(style: str):
    tmp = tempfile.mkdtemp()
    wav = os.path.join(tmp, f"{style}.wav")
    subprocess.run([sys.executable, os.path.join(HERE, "song.py"), style, wav], check=True, cwd=HERE)
    with open(os.path.join(tmp, f"{style}.grid.json")) as f:
        grid = json.load(f)
    with wave.open(wav) as w:
        pcm = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float) / 32767
    return tmp, wav, grid, pcm


class TrackChecks:
    """Shared checks: every track shares the plan, opens with the punch, breaks before the phone."""

    def rms_s(self, a, b):
        """RMS of the interleaved stereo pcm between seconds a and b."""
        return np.sqrt(np.mean(self.pcm[int(a * 44100 * 2):int(b * 44100 * 2)] ** 2))

    def rms_bars(self, a, b):
        bar = self.grid["bar_seconds"]
        return self.rms_s(a * bar, b * bar)

    def test_grid_shape(self):
        g = self.grid
        self.assertEqual(g["bpm"], BPM)
        self.assertEqual(g["bars"], BARS)
        self.assertAlmostEqual(g["bar_seconds"], 240 / BPM, places=4)
        self.assertEqual(len(g["beats"]), BARS * 4)
        self.assertEqual([(s["name"], s["bar"]) for s in g["sections"]], STORYBOARD)
        self.assertEqual([s["t"] for s in g["sections"]], [b * g["bar_seconds"] for _, b in STORYBOARD])

    def test_audio_is_sane(self):
        with wave.open(self.wav) as w:
            n, sr = w.getnframes(), w.getframerate()
        self.assertEqual(sr, 44100)
        self.assertAlmostEqual(n / sr, BARS * 240 / BPM + 2.5, delta=0.05)
        self.assertFalse(np.isnan(self.pcm).any())
        self.assertLessEqual(np.abs(self.pcm).max(), 10 ** (-1 / 20) + 1e-3)   # peak ≤ -1 dBFS
        self.assertGreater(np.abs(self.pcm).max(), 0.5)                            # not silent

    def test_opens_with_an_impact(self):
        # Bar 0 beat 1 is the mascot's punch: the music starts from silence and the very first 30 ms
        # must already be as loud as a drop-bar downbeat, not a pad fading in. Compared against the
        # first 30 ms of drop 2 (bar 20) so the bar is "as loud as the loudest hit", not a fixed number.
        bar = self.grid["bar_seconds"]
        self.assertGreater(self.rms_s(0, 0.03), 0.6 * self.rms_s(20 * bar, 20 * bar + 0.03))
        self.assertGreater(self.rms_s(0, 0.03), 0.1)
        # ...and the intro texture after it is still lifted into audibility (LIFT_DB), not left at -32 dB.
        self.assertGreater(self.rms_bars(1, 2), self.rms_bars(7, 9) * 0.18)

    def test_break_is_quieter_than_drop(self):
        self.assertLess(self.rms_bars(36, 38), self.rms_bars(7, 9) * 0.8)      # the break drops the drums
        self.assertGreater(self.rms_bars(36, 38), self.rms_bars(7, 9) * 0.18)  # ...but never more than ~15 dB under (the lift pass)

    def test_gap_before_drop1_is_silent(self):
        bar = self.grid["bar_seconds"]
        gap_start, drop_start = (M.GAP_BAR + 14 / 16) * bar, (M.GAP_BAR + 1) * bar
        # The gap window is NOT literally all-zero on the rendered wav: the bar-6 riser is designed to
        # swell right up to the drop and is intentionally still sounding here. 0.08 sits above that
        # riser-only floor but well below the ~0.18 a real regression (drums/pad left unmuted) produces.
        self.assertLess(self.rms_s(gap_start, drop_start), 0.08)
        self.assertGreater(self.rms_s(drop_start, drop_start + 0.03), 0.1)  # drop 1 lands right after
        s = M.TRACKS[self.style]()
        gf, gt = s.at(M.GAP_BAR, 14), s.at(M.GAP_BAR + 1, 0)
        for name, buf in s.tracks.items():
            if name != "riser":
                self.assertTrue(np.all(buf[gf:gt] == 0), f"{name} is not silent in the gap")
        # Drop 2 has NO gap: its fill (bar 19) runs straight into bar 20.
        self.assertGreater(self.rms_s((19 + 14 / 16) * bar, 20 * bar), 0.1)


class PromoTrack(TrackChecks, unittest.TestCase):
    style = "promo"

    @classmethod
    def setUpClass(cls):
        cls.tmp, cls.wav, cls.grid, cls.pcm = _render(cls.style)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)  # clean up the rendered wav/sfx/grid.json fixture

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

    def test_the_hook_does_not_loop_every_two_bars(self):
        # Destin, 2026-09-09: the first film's two-bar hook "gets a little annoying". The lead now
        # plays a FOUR-bar melody: bar k and bar k+2 of a drop must differ.
        s = M.TRACKS["promo"]()
        lead = s.tracks["lead"]
        b7, b9 = lead[s.at(7):s.at(8)], lead[s.at(9):s.at(10)]
        self.assertGreater(np.mean(np.abs(b7 - b9)), 0.01)


class LofiTrack(TrackChecks, unittest.TestCase):
    style = "promo-lofi"

    @classmethod
    def setUpClass(cls):
        cls.tmp, cls.wav, cls.grid, cls.pcm = _render(cls.style)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)


class PopTrack(TrackChecks, unittest.TestCase):
    style = "promo-pop"

    @classmethod
    def setUpClass(cls):
        cls.tmp, cls.wav, cls.grid, cls.pcm = _render(cls.style)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)


if __name__ == "__main__":
    unittest.main()
