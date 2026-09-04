"""Pattern sequencer + the promo's music, on top of synth.py.

    python3 song.py <sketch-a|sketch-b> <out.wav>          # renders one piece
    (also writes <out>.grid.json: every bar/beat time + section marks, for Remotion)

Patterns are strings over 16th notes: "x" hit, "X" accent, "o" open (hats), "." rest.
Chords are midi-note lists. Everything is deterministic (seeded) so re-rendering the
same sketch gives byte-identical audio.
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np

import synth as S


class Song:
    def __init__(self, bpm: float, bars: int, swing=0.0, tail=1.5):
        self.bpm, self.bars, self.swing = bpm, bars, swing
        self.beat = 60 / bpm
        self.bar = 4 * self.beat
        self.n = S.secs(bars * self.bar + tail)
        self.tracks: dict[str, np.ndarray] = {}
        self.kicks: list[int] = []           # kick sample positions, for sidechain
        self.sections: list[dict] = []

    # --- time ---
    def at(self, bar: float, step: float = 0) -> int:
        """Sample index of 16th-note `step` in `bar`; odd 16ths are delayed by `swing`."""
        t = bar * self.bar + step * self.beat / 4
        if self.swing and int(step) % 2 == 1:
            t += self.swing * self.beat / 4 * 0.5
        return S.secs(t)

    def track(self, name: str) -> np.ndarray:
        if name not in self.tracks:
            self.tracks[name] = np.zeros(self.n, dtype=np.float32)
        return self.tracks[name]

    def section(self, name: str, bar: int):
        self.sections.append({"name": name, "bar": bar, "t": bar * self.bar})

    # --- writing ---
    def hits(self, name: str, pattern: str, bar: int, make, gain=1.0, accent=1.35, **kw):
        buf = self.track(name)
        for i, ch in enumerate(pattern):
            if ch == ".": continue
            g = gain * (accent if ch == "X" else 1.0)
            clip = make(open_=True) if (ch == "o" and "hat" in name) else make(**kw)
            pos = self.at(bar, i)
            if name == "kick": self.kicks.append(pos)
            S.place(buf, clip, pos, g)

    def note(self, name: str, bar: float, step: float, clip: np.ndarray, gain=1.0):
        S.place(self.track(name), clip, self.at(bar, step), gain)

    # --- output ---
    def mix(self, gains: dict[str, float], fx=None, pans=None) -> np.ndarray:
        out = np.zeros((self.n, 2), dtype=np.float32)
        for name, buf in self.tracks.items():
            x = buf
            if fx and name in fx: x = fx[name](x)
            w, p = (pans or {}).get(name, (0.0, 0.0))
            out += S.to_stereo(x, w, p) * gains.get(name, 1.0)
        return S.master(out)

    def grid(self) -> dict:
        beats = [{"bar": b, "beat": k, "t": round(b * self.bar + k * self.beat, 4)} for b in range(self.bars) for k in range(4)]
        return {"bpm": self.bpm, "bars": self.bars, "bar_seconds": self.bar, "beat_seconds": self.beat,
                "beats": beats, "sections": self.sections}


# ---------------------------------------------------------------- sketch A
def arcade_synthwave(bars=8) -> Song:
    """118 BPM. Chiptune arps over a driving supersaw/sidechain groove — whimsical on top, badass underneath."""
    s = Song(118, bars)
    chords = [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]]     # Am F/A C/G G
    roots = [45, 41, 48, 43]                                              # A F C G
    KICK, SNR, HAT = "x...x...x...x...", "....x.......x...", "x.x.x.x.x.x.x.xo"
    s.section("intro", 0); s.section("groove", 2)
    for bar in range(bars):
        ch, root = chords[bar % 4], roots[bar % 4]
        full = bar >= 2
        # drums
        s.hits("hat", HAT if full else "..x...x...x...x.", bar, S.hat, gain=0.55)
        if full:
            s.hits("kick", KICK, bar, S.kick)
            fill = bar % 8 == 7
            s.hits("snare", "....x.......xxxX" if fill else SNR, bar, S.snare, gain=0.8)
            s.hits("clap", SNR, bar, S.clap, gain=0.5)
        # bass: eighths on the root, octave-up pushes on the "and" of 2 and 4
        if full:
            for i in range(8):
                n = root + (12 if i in (3, 7) else 0)
                s.note("bass", bar, i * 2, S.bass_saw(n, s.beat / 2 * 0.9, cutoff=700, sweep=1600), 0.9)
        # arp: 16ths climbing through the chord across two octaves
        seq = ch + [m + 12 for m in ch] + [ch[2] + 12, ch[1] + 12]
        for i in range(16):
            n = seq[i % len(seq)]
            s.note("arp", bar, i, S.chip_pulse(n + 12, s.beat / 4 * 0.85, duty=0.25 if full else 0.5), 0.5 if full else 0.4)
        # pad
        s.note("pad", bar, 0, S.pad_supersaw([m + (0 if full else 12) for m in ch], s.bar * 1.02, cutoff=2200 if full else 1200), 0.8)
        # lead hook on the last two bars
        if bar % 8 in (6, 7):
            hook = [(0, 76, 2), (2, 79, 2), (4, 81, 3), (8, 79, 2), (10, 76, 2), (12, 72, 4)] if bar % 8 == 6 else [(0, 74, 3), (4, 76, 3), (8, 79, 6)]
            prev = None
            for step, n, ln in hook:
                s.note("lead", bar, step, S.lead_pulse(n, s.beat / 4 * ln * 0.95, glide_from=prev), 0.55); prev = n
    # riser into the groove: a noise swell over the last intro bar
    n = S.secs(s.bar); sw = S.onepole_hp(S.noise(n), 800 + 6000 * np.linspace(0, 1, n) ** 2) * np.linspace(0, 1, n) ** 2
    s.note("riser", 1, 0, sw.astype(np.float32), 0.35)
    return s


def render_a(out: str):
    s = arcade_synthwave()
    pump = S.sidechain(s.n, s.kicks, depth=0.65, recover=0.26)
    fx = {
        "arp": lambda x: S.delay(x, s.beat * 0.75, 0.3, 0.28),
        "pad": lambda x: S.reverb(x * pump, 0.9, 0.35, 0.35),
        "bass": lambda x: x * pump,
        "snare": lambda x: S.reverb(x, 0.7, 0.2, 0.22),
        "clap": lambda x: S.reverb(x, 0.8, 0.2, 0.3),
        "lead": lambda x: S.delay(S.reverb(x, 0.8, 0.3, 0.25), s.beat * 0.5, 0.35, 0.3),
    }
    gains = {"kick": 1.0, "snare": 0.8, "clap": 0.5, "hat": 0.5, "bass": 0.7, "arp": 0.42, "pad": 0.5, "lead": 0.55, "riser": 0.5}
    pans = {"arp": (0.6, 0.2), "pad": (1.0, 0.0), "hat": (0.3, -0.25), "lead": (0.5, -0.1)}
    S.write_wav(out, s.mix(gains, fx, pans)); return s


# ---------------------------------------------------------------- sketch B
def lofi_playful(bars=6) -> Song:
    """90 BPM, swung. Warm electric-piano chords, boom-bap drums, vinyl. Chill and playful, less punch."""
    s = Song(90, bars, swing=0.58)
    chords = [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65]]   # Cmaj7 Am7 Dm7 G7
    roots = [36, 33, 38, 31]
    KICK, SNR, HAT, RIM = "x..x..x...x.x...", "....x.......x...", "x.xxx.x.x.xxx.xo", "..x.......x....."
    melody = [(0, 79, 2), (3, 76, 2), (6, 74, 2), (8, 72, 3), (12, 74, 2), (14, 76, 2)]
    s.section("groove", 0)
    for bar in range(bars):
        ch, root = chords[bar % 4], roots[bar % 4]
        s.hits("kick", KICK, bar, S.kick, gain=0.85, punch=0.8)
        s.hits("snare", SNR, bar, S.clap, gain=0.7)
        s.hits("snare", SNR, bar, S.snare, gain=0.35, bright=0.5)
        s.hits("hat", HAT, bar, S.hat, gain=0.35)
        s.hits("rim", RIM, bar, S.rim, gain=0.35)
        for i in (0, 6, 10):
            s.note("bass", bar, i, S.bass_sub(root, s.beat * 0.7), 0.9)
        s.note("keys", bar, 0, S.rhodes(ch, s.beat * 1.6), 0.9)
        s.note("keys", bar, 6, S.rhodes([m - 12 for m in ch[1:]] + [ch[3]], s.beat * 1.2), 0.6)
        if bar % 2 == 1:
            for step, n, ln in melody:
                s.note("pluck", bar, step, S.pluck(n, s.beat / 4 * ln * 0.9, bright=1800), 0.5)
    s.note("vinyl", 0, 0, S.vinyl(s.n, 0.06), 1.0)
    return s


def render_b(out: str):
    s = lofi_playful()
    fx = {
        "keys": lambda x: S.reverb(S.onepole_lp(x, 3800, 1), 0.85, 0.4, 0.3),
        "pluck": lambda x: S.delay(S.reverb(x, 0.8, 0.4, 0.25), s.beat * 0.75, 0.3, 0.25),
        "snare": lambda x: S.reverb(x, 0.6, 0.4, 0.2),
        "kick": lambda x: S.onepole_lp(x, 2500, 1),
    }
    gains = {"kick": 1.0, "snare": 0.75, "hat": 0.45, "rim": 0.4, "bass": 0.8, "keys": 0.7, "pluck": 0.5, "vinyl": 1.0}
    pans = {"keys": (0.8, 0.0), "pluck": (0.4, 0.25), "hat": (0.2, -0.3), "rim": (0.0, 0.3)}
    S.write_wav(out, s.mix(gains, fx, pans)); return s


# ---------------------------------------------------------------- the promo track
def promo_track() -> Song:
    """The approved arcade-synthwave material arranged to the storyboard (spec → Music table).
    34 bars: intro 0-1 · drop1 2-4 (fill on 4) · groove 5-7 · hook 8-13 (fill on 13) · break 14-15 ·
    build 16-17 · groove2 18-21 (half-time snare) · 22 (fill + gap) · drop2 23-28 (hook, brighter;
    accents on 25 and 27 for the theme flips; fill on 28) · outro 29-32 · end 33."""
    s = Song(118, 34, tail=2.5)
    chords = [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]]     # Am F/A C/G G
    roots = [45, 41, 48, 43]
    KICK, SNR, HAT = "x...x...x...x...", "....x.......x...", "x.x.x.x.x.x.x.xo"
    HOOK_A = [(0, 76, 2), (2, 79, 2), (4, 81, 3), (8, 79, 2), (10, 76, 2), (12, 72, 4)]
    HOOK_B = [(0, 74, 3), (4, 76, 3), (8, 79, 6)]
    # Re-planned 2026-09-03 storyboard: the games hook is six bars (8-13, the Flappy flight is 12-13),
    # groove2 (phone) is four bars, drop1/groove are 3+3. Bar 23 (drop 2) does not move — the theme
    # flip lands on it. Bar 22 is still groove2 by name: it carries the fill and the gap below.
    for name, bar in (("intro", 0), ("drop1", 2), ("groove", 5), ("hook", 8), ("break", 14), ("build", 16),
                      ("groove2", 18), ("drop2", 23), ("outro", 29), ("end", 33)):
        s.section(name, bar)

    def section_of(bar):
        return [sec["name"] for sec in s.sections if sec["bar"] <= bar][-1]

    for bar in range(34):
        sec = section_of(bar)
        ch, root = chords[bar % 4], roots[bar % 4]
        drums = sec in ("drop1", "groove", "hook", "groove2", "drop2") or (sec == "outro" and bar < 31)
        hook = sec in ("hook", "drop2")
        bright = sec == "drop2"
        # --- drums
        if drums:
            s.hits("kick", KICK, bar, S.kick)
            snare_pat = SNR
            if sec == "groove2": snare_pat = "........x......."            # half-time
            if bar == 22: snare_pat = "....x.......xx.."                   # fill trails off into the pre-drop-2 gap (see below)
            elif bar in (13, 28): snare_pat = "....x.......xxxX"           # fills before a section change
            elif bar == 4: snare_pat = "....x.......x.xX"                   # a short push into the groove (drop1 -> spreadsheet cut on 5)
            s.hits("snare", snare_pat, bar, S.snare, gain=0.8)
            s.hits("clap", SNR if sec != "groove2" else "........x.......", bar, S.clap, gain=0.5)
            s.hits("hat", HAT, bar, S.hat, gain=0.55 if not bright else 0.65)
            if bar in (25, 27):
                # Theme flips 2 and 3 land on these downbeats (flip 1 is bar 23, which the gap already
                # sets up). An open hat + clap on beat 1 gives each flip a hit under it; the pad already
                # re-triggers on every bar's downbeat, so the bass/arp/pad material is untouched.
                s.hits("hat", "o...............", bar, S.hat, gain=0.6)
                s.hits("clap", "x...............", bar, S.clap, gain=0.7)
        elif sec == "build":
            s.hits("hat", "x.x.x.x.x.x.x.x." if bar == 16 else "xxxxxxxxxxxxxxxx", bar, S.hat, gain=0.45)
            s.hits("snare", "x...x...x...x..." if bar == 16 else "x.x.x.x.xxxxxxxx", bar, S.snare, gain=0.55)
        elif sec in ("intro", "break"):
            s.hits("hat", "..x...x...x...x.", bar, S.hat, gain=0.4)
        elif sec == "end":
            s.hits("kick", "x...............", bar, S.kick)
            s.hits("clap", "x...............", bar, S.clap, gain=0.7)
            s.hits("hat", "o...............", bar, S.hat, gain=0.6)
        # --- bass
        if drums or sec == "build":
            for i in range(8):
                n = root + (12 if i in (3, 7) else 0)
                s.note("bass", bar, i * 2, S.bass_saw(n, s.beat / 2 * 0.9, cutoff=700 + (400 if bright else 0), sweep=1600), 0.9)
        # --- arp (everywhere except the final bar)
        if sec != "end":
            seq = ch + [m + 12 for m in ch] + [ch[2] + 12, ch[1] + 12]
            thin = sec in ("intro", "break", "outro")
            for i in range(16):
                if thin and i % 2 == 1: continue
                s.note("arp", bar, i, S.chip_pulse(seq[i % len(seq)] + 12, s.beat / 4 * 0.85, duty=0.5 if thin else 0.25), 0.4 if thin else 0.5)
        # --- pad
        pad_notes = [m + (12 if sec in ("intro", "break") else 0) for m in ch]
        s.note("pad", bar, 0, S.pad_supersaw(pad_notes, s.bar * (2.4 if sec == "end" else 1.02), cutoff=2600 if bright else (1200 if sec in ("intro", "break", "outro") else 2200)), 0.8)
        # --- lead hook (two-bar phrase, repeats)
        if hook:
            prev = None
            for step, n, ln in (HOOK_A if bar % 2 == 0 else HOOK_B):
                s.note("lead", bar, step, S.lead_pulse(n + (12 if bright and bar % 4 >= 2 else 0), s.beat / 4 * ln * 0.95, glide_from=prev), 0.55); prev = n
        # --- lead: one long resolving note on the end bar
        if sec == "end":
            s.note("lead", bar, 0, S.lead_pulse(81, s.bar * 1.6), 0.5)
    # risers: into drop1 (bar 1) and into drop2 (bars 16-17 → landing at 23 is the fill; the build's riser spans 21-22)
    for start, length in ((1, 1), (21, 2)):
        n = S.secs(s.bar * length)
        sw = S.onepole_hp(S.noise(n), 800 + 6000 * np.linspace(0, 1, n) ** 2) * np.linspace(0, 1, n) ** 2
        s.note("riser", start, 0, sw.astype(np.float32), 0.35)
    # the "gap": bar 22's fill plays two 16ths (steps 12-13), then EVERY track — pad included — goes
    # dead silent for the last half-beat (steps 14-15), so drop 2 lands from nothing. The pad's reverb
    # and the arp's delay are applied later, inside s.mix(), which runs on the whole (now-zeroed)
    # buffer — so the reverb/delay tail built up before the gap still rings forward into it even
    # though the dry signal here is exactly zero.
    gap_from, gap_to = s.at(22, 14), s.at(23, 0)
    for name in ("kick", "snare", "clap", "hat", "bass", "arp", "lead", "pad"):
        if name in s.tracks: s.tracks[name][gap_from:gap_to] = 0
    return s


# Sections that get lifted after the mix: bar -> dB boost. Measured: the drops sit at -10.8 dB RMS
# per bar; the intro (0-1), break (14-15) and outro (31-32) sit at -32 dB — 22 dB down, inaudible on
# a laptop speaker under a video. These boosts bring them to roughly -22 dB (~12 dB under the drops:
# reads as "quiet", not "gone") without touching the drop bars or any instrument's own balance.
LIFT_DB = {0: 9, 1: 9, 14: 10, 15: 10, 31: 9, 32: 9}


def _lift_envelope(s: Song, lift_db: dict[int, float], ramp: float = 0.04) -> np.ndarray:
    """Sample-length linear-in-dB envelope, `lift_db[bar]` (default 0) held flat across each bar,
    with a `ramp`-second linear crossfade centered on every bar boundary where the value changes —
    so a boosted section doesn't click in or out. Returns a linear (not dB) multiplier."""
    times, dbs = [0.0], [lift_db.get(0, 0.0)]
    for b in range(s.bars):
        v, nxt = lift_db.get(b, 0.0), lift_db.get(b + 1, 0.0)
        t1 = (b + 1) * s.bar
        if v != nxt:
            times += [t1 - ramp / 2, t1 + ramp / 2]
            dbs += [v, nxt]
        else:
            times.append(t1); dbs.append(v)
    times.append(s.n / S.SR); dbs.append(dbs[-1])   # hold the last value flat through the tail
    env_db = np.interp(np.arange(s.n) / S.SR, times, dbs)
    return (10 ** (env_db / 20)).astype(np.float32)


def render_promo(out: str):
    s = promo_track()
    pump = S.sidechain(s.n, s.kicks, depth=0.65, recover=0.26)
    fx = {
        "arp": lambda x: S.delay(x, s.beat * 0.75, 0.3, 0.28),
        "pad": lambda x: S.reverb(x * pump, 0.9, 0.35, 0.35),
        "bass": lambda x: x * pump,
        "snare": lambda x: S.reverb(x, 0.7, 0.2, 0.22),
        "clap": lambda x: S.reverb(x, 0.8, 0.2, 0.3),
        "lead": lambda x: S.delay(S.reverb(x, 0.8, 0.3, 0.25), s.beat * 0.5, 0.35, 0.3),
    }
    gains = {"kick": 1.0, "snare": 0.8, "clap": 0.5, "hat": 0.5, "bass": 0.7, "arp": 0.42, "pad": 0.5, "lead": 0.55, "riser": 0.5}
    pans = {"arp": (0.6, 0.2), "pad": (1.0, 0.0), "hat": (0.3, -0.25), "lead": (0.5, -0.1)}
    mixed = s.mix(gains, fx, pans)
    # Apply the lift after the full mix+master so it moves the finished mix, not one instrument, then
    # re-master (soft-clip + peak-normalize) since the boosted bars can otherwise exceed 0 dBFS.
    lift = _lift_envelope(s, LIFT_DB)[:, None]      # (n, 1) broadcasts over both channels
    mastered = S.master(mixed * lift)
    S.write_wav(out, mastered)
    d = os.path.dirname(os.path.abspath(out))
    for name, make in (("pop", S.sfx_pop), ("whoosh", S.sfx_whoosh), ("chime", S.sfx_chime)):
        S.write_wav(os.path.join(d, f"sfx-{name}.wav"), S.master(S.to_stereo(make()), -3.0))
    return s


if __name__ == "__main__":
    which, out = sys.argv[1], sys.argv[2]
    song = {"sketch-a": render_a, "sketch-b": render_b, "promo": render_promo}[which](out)
    with open(out.rsplit(".", 1)[0] + ".grid.json", "w") as f:
        json.dump(song.grid(), f, indent=1)
    print(f"wrote {out} ({song.bars} bars @ {song.bpm} BPM, {song.n / S.SR:.1f}s)")
