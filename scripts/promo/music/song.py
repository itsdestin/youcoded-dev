"""Pattern sequencer + the promo's music, on top of synth.py.

    python3 song.py <sketch-a|sketch-b|promo> <out.wav>    # renders one piece
    (also writes <out>.grid.json: every bar/beat time + section marks, for Remotion;
     `promo` also writes the sfx-*.wav UI sounds next to it — see SFX in render_promo)

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
# The 49-bar plan at 120 BPM (2026-09-09: Destin wanted the film quicker, and the music "less
# annoying by the two-minute mark" — more variety, better sound). Every bar here is keyed to
# timeline.ts BEATS (b1 0-5 · b3 5-10 · b4 10-14 · b5 14-20 · b9 20-25 · b2 25-29 · b6 29-36 ·
# b8 36-41 · b7 41-45 · b10 45-49), so a re-cut edits THIS block and the BEATS list together:
#   intro 0-1 (the punch on bar 0) · groove 2-6 (bar 6 = riser + fill + the gap) · drop1 7-9 (the
#   three theme flips on 7, 8, 9) · groove-b 10-19 (the model, the sheet; the lead sneaks in on
#   18-19 under project view; riser 18-19, fill on 19) · drop2 20-24 (the marketplace) · groove-c
#   25-28 (the chips) · hook 29-35 (games; fill on 35) · break 36-37 (the phone) · build 38-40 ·
#   groove2 41-44 (conversations, half-time, on the SECOND chord progression) · outro 45-47 (drums
#   out from 47) · end 48 (the final hit, 2.5 s tail). (51 → 49 bars on 2026-09-09: the conversations beat lost two.)
# Three tracks share the plan so the film's cuts land on the same downbeats whichever Destin picks:
#   promo       the arcade-synthwave track of the first film, reworked (below)
#   promo-lofi  warm keys and boom-bap, swung
#   promo-pop   bright indie-pop: four-on-the-floor, a plucked riff, a round whistling lead
BPM, BARS = 120, 49
PLAN = [("intro", 0), ("groove", 2), ("drop1", 7), ("groove-b", 10), ("drop2", 20), ("groove-c", 25), ("hook", 29),
        ("break", 36), ("build", 38), ("groove2", 41), ("outro", 45), ("end", 48)]
FLIPS = (7, 8, 9)                 # the theme flips (Beat3): drop 1 lands on the first
GAP_BAR = 6                       # the fill trails off and everything goes silent for the last half-beat before drop 1
LEAD_EARLY = (18, 19)             # the lead's early entry under project view
FILLS = {6: "....x.......xx..", 19: "....x.......xxxX", 35: "....x.......xxxX"}
RISERS = ((1, 1), (6, 1), (18, 2), (39, 2))   # (bar, bars): a noise swell reaching full level on the next downbeat
DRUMS_OUT_FROM = 47
DRUM_SECTIONS = ("groove", "drop1", "groove-b", "groove-c", "hook", "groove2", "drop2")
# Per-bar dB trims applied AFTER the mix (a linear-in-dB envelope with a 40 ms crossfade at every
# change). Measured 2026-09-09 on all three tracks: with every instrument at its own gain the grooves
# and the drops both sat at about −11 dB RMS — the drums and bass set the level, so a drop was only
# "more instruments", never louder — and the intro sat 20 dB under, the break 5 dB under. So: the
# grooves are pulled down 2.5 dB (1 dB where a riser is building), the drops and the games hook sit
# at 0, the intro bars come up 9 dB (the punch pre-trims itself, see _impact_trim), the break stays
# where the arrangement puts it, the drumless bar 47 comes up 5 dB so the last hit is not a cliff,
# and bar 49 (which does not exist) holds the end lift flat through the tail.
LIFT_DB = {0: 9, 1: 9, 47: 5, 48: 9, 49: 9}
LIFT_DB.update({b: -2.5 for b in (2, 3, 4, 5, *range(10, 18), *range(25, 29), *range(41, 45))})
LIFT_DB.update({6: -1, 18: -1, 19: -1, 45: -1.5, 46: -1.5})
# Two chord progressions in the same key (A minor / C major): the first film's Am F C G, and a
# second one — Dm F Am G — for the last third, so the ear gets somewhere new before the end.
PROG_A = ([[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]], [45, 41, 48, 43])
PROG_B = ([[57, 62, 65], [57, 60, 65], [57, 60, 64], [55, 59, 62]], [38, 41, 45, 43])
KICK, SNR, HAT = "x...x...x...x...", "....x.......x...", "x.x.x.x.x.x.x.xo"


def _plan_song(swing=0.0) -> Song:
    s = Song(BPM, BARS, swing=swing, tail=2.5)
    for name, bar in PLAN:
        s.section(name, bar)
    return s


def _section_of(s: Song, bar: int) -> str:
    return [sec["name"] for sec in s.sections if sec["bar"] <= bar][-1]


def _chord(sec: str, bar: int):
    """The chord and bass root under `bar`: progression B for the last third, A elsewhere; the end bar resolves to Am."""
    if sec == "end":
        return [57, 60, 64], 45
    chords, roots = PROG_B if sec in ("groove2", "outro") else PROG_A
    return chords[bar % 4], roots[bar % 4]


def _impact_trim() -> float:
    # The bar-0 impact is written this much quieter than a drop-bar hit: LIFT_DB lifts the whole of
    # bar 0 after the mix (so the intro texture is audible), and without the trim the hit would land
    # that much ABOVE the drops, become the track's peak, and the peak-normalise in master() would
    # pull every other bar down by it. Trimmed, it lands at exactly drop level.
    return 10 ** (-LIFT_DB.get(0, 0) / 20)


def _impact(s: Song, extra=None):
    """The punch: the music starts from silence on this exact sample, so beat 1 of bar 0 has to be a
    real hit before the intro texture settles in — kick + clap + open hat + a crash-like burst."""
    g = _impact_trim()
    s.hits("kick", "x...............", 0, S.kick, gain=g)
    s.hits("clap", "x...............", 0, S.clap, gain=0.7 * g)
    s.hits("hat", "o...............", 0, S.hat, gain=0.6 * g)
    s.note("crash", 0, 0, S.crash(), 0.8 * g)


def _risers(s: Song, gain=0.35):
    for start, length in RISERS:
        n = S.secs(s.bar * length)
        sw = S.onepole_hp(S.noise(n), 800 + 6000 * np.linspace(0, 1, n) ** 2) * np.linspace(0, 1, n) ** 2
        s.note("riser", start, 0, sw.astype(np.float32), gain)


def _gap(s: Song):
    """Bar 6's fill plays two 16ths (steps 12-13), then EVERY track goes dead silent for the last
    half-beat (steps 14-15), so drop 1 lands from nothing. The reverb/delay are applied later, inside
    s.mix(), on the whole buffer — so the tail built up before the gap still rings into it."""
    gap_from, gap_to = s.at(GAP_BAR, 14), s.at(GAP_BAR + 1, 0)
    for name, buf in s.tracks.items():
        if name != "riser":
            buf[gap_from:gap_to] = 0


def _end_hit(s: Song):
    end = BARS - 1
    s.hits("kick", "x...............", end, S.kick)
    s.hits("clap", "x...............", end, S.clap, gain=0.7)
    s.hits("hat", "o...............", end, S.hat, gain=0.6)


# ---- promo: the reworked synthwave track
# What changed from the first film (Destin: "gets a little annoying"): the arp no longer runs 16ths
# through every bar — it thins to 8ths in the grooves and rests in the break; it alternates direction
# by bar; the two-bar hook became a FOUR-bar melody (A B C D) so it stops looping; warm keys answer
# the chords in the grooves and carry the break; a plucked counter-line pushes the games section; the
# last third moves to the second progression; and the arp is low-passed so it stops piercing.
HOOK = [
    [(0, 76, 2), (2, 79, 2), (4, 81, 3), (8, 79, 2), (10, 76, 2), (12, 72, 4)],
    [(0, 74, 3), (4, 76, 3), (8, 79, 6)],
    [(0, 81, 2), (2, 84, 2), (4, 83, 3), (8, 81, 2), (10, 79, 2), (12, 76, 4)],
    [(0, 77, 3), (4, 76, 3), (8, 74, 2), (10, 72, 2), (12, 69, 4)],
]


def promo_track() -> Song:
    s = _plan_song()
    for bar in range(BARS):
        sec = _section_of(s, bar)
        ch, root = _chord(sec, bar)
        drums = sec in DRUM_SECTIONS or (sec == "outro" and bar < DRUMS_OUT_FROM)
        hook_from = {"drop1": 7, "hook": 29, "drop2": 20}.get(sec, LEAD_EARLY[0] if bar in LEAD_EARLY else None)
        bright = {"drop1": 1, "drop2": 2}.get(sec, 0)          # 0 plain · 1 drop 1 (brighter) · 2 drop 2 (brightest)
        # --- drums
        if drums:
            s.hits("kick", KICK, bar, S.kick)
            snare_pat = "........x......." if sec == "groove2" else FILLS.get(bar, SNR)
            s.hits("snare", snare_pat, bar, S.snare, gain=0.8)
            s.hits("clap", SNR if sec != "groove2" else "........x.......", bar, S.clap, gain=0.5)
            s.hits("hat", HAT, bar, S.hat, gain=(0.5, 0.55, 0.6)[bright])
            if bar in FLIPS[1:]:
                # flips 2 and 3 land on these downbeats (flip 1 is the drop the gap sets up): an open hat + clap under each
                s.hits("hat", "o...............", bar, S.hat, gain=0.6)
                s.hits("clap", "x...............", bar, S.clap, gain=0.7)
        elif sec == "build":
            k = bar - 38                                           # 0, 1, 2: the roll tightens bar by bar
            s.hits("hat", ("x.x.x.x.x.x.x.x.", "x.x.x.x.xxxxxxxx", "xxxxxxxxxxxxxxxx")[k], bar, S.hat, gain=0.45)
            s.hits("snare", ("x...x...x...x...", "x.x.x.x.x.x.x.x.", "x.x.x.x.xxxxxxxx")[k], bar, S.snare, gain=0.5 + 0.05 * k)
        elif sec in ("intro", "break"):
            s.hits("hat", "..x...x...x...x.", bar, S.hat, gain=0.4)
            if bar == 0: _impact(s)
        elif sec == "end":
            _end_hit(s)
        # --- bass: eighths on the root with octave pushes in the drops; a syncopated line in the grooves
        if drums or sec == "build":
            pat = [(i * 2, root + (12 if i in (3, 7) else 0)) for i in range(8)] if bright or sec in ("hook", "build") \
                else [(0, root), (3, root), (6, root + 12), (8, root), (11, root), (14, root + 12)]
            for step, n in pat:
                s.note("bass", bar, step, S.bass_saw(n, s.beat / 2 * 0.9, cutoff=700 + 200 * bright, sweep=1600), 0.9)
        elif sec == "break":
            s.note("bass", bar, 0, S.bass_sub(root, s.bar * 0.95), 0.9)
        # --- arp: 16ths only where the track is full; 8ths in the grooves; rests in the break and end
        if sec not in ("end", "break"):
            seq = ch + [m + 12 for m in ch] + [ch[2] + 12, ch[1] + 12]
            if bar % 2: seq = seq[::-1]                            # down one bar, up the next
            full = bright or sec == "hook"
            thin = sec in ("intro", "outro")
            for i in range(16):
                if not full and i % 2 == 1: continue
                s.note("arp", bar, i, S.chip_pulse(seq[i % len(seq)] + 12, s.beat / 4 * 0.85, duty=0.25 if full else 0.4), 0.5 if full else 0.36 if not thin else 0.3)
        # --- keys: a short stab on beats 2 and 4 in the grooves; a held chord in the break and the outro
        if sec in ("groove-b", "groove-c", "groove2"):
            for step in (4, 12):
                s.note("keys", bar, step, S.rhodes(ch, s.beat * 0.55, tremolo=0.05), 0.55)
        elif sec in ("break", "outro"):
            s.note("keys", bar, 0, S.rhodes(ch, s.bar * 1.02), 0.8)
        # --- pluck: a counter-line on the pushes in the games section and the second drop
        if sec in ("hook", "drop2"):
            tones = [ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[2] + 24 if bar % 2 else ch[0] + 24]
            for k, step in enumerate((3, 7, 11, 15)):
                s.note("pluck", bar, step, S.pluck(tones[k], s.beat / 4 * 1.6, bright=2200), 0.42)
        # --- pad (an octave up in the quiet sections; the outro climbs once the drums leave)
        pad_notes = [m + (12 if sec in ("intro", "break") or (sec == "outro" and bar >= DRUMS_OUT_FROM) else 0) for m in ch]
        s.note("pad", bar, 0, S.pad_supersaw(pad_notes, s.bar * (2.4 if sec == "end" else 1.02), cutoff=(2200, 2400, 2600)[bright] if bright or sec not in ("intro", "break", "outro") else 1200), 0.8)
        # --- lead: the four-bar melody, phrases from the bar the hook ENTERS; drop 2's second half an octave up
        if hook_from is not None:
            k = bar - hook_from
            prev = None
            for step, n, ln in HOOK[k % 4]:
                s.note("lead", bar, step, S.lead_pulse(n + (12 if bright == 2 and k % 8 >= 4 else 0), s.beat / 4 * ln * 0.95, glide_from=prev), 0.55); prev = n
        if sec == "end":
            s.note("lead", bar, 0, S.lead_pulse(81, s.bar * 1.6), 0.5)
    _risers(s)
    _gap(s)
    return s


# ---- promo-lofi: warm keys and boom-bap, swung — the first film's sketch B, arranged to the plan
LOFI_MELODY = [
    [(0, 79, 2), (3, 76, 2), (6, 74, 2), (8, 72, 3), (12, 74, 2), (14, 76, 2)],
    [(0, 81, 3), (4, 79, 2), (6, 76, 2), (8, 74, 3), (12, 72, 4)],
]


def promo_track_lofi() -> Song:
    s = _plan_song(swing=0.56)
    chords7 = [[57, 60, 64, 67], [57, 60, 64, 65], [55, 59, 60, 64], [55, 59, 62, 64]]     # Am7 Fmaj7/A Cmaj7/G G6
    roots = [33, 29, 36, 31]
    KICK_L, HAT_FULL, HAT_LITE, RIM = "x..x..x...x.x...", "x.xxx.x.x.xxx.xo", "x...x...x...x...", "..x.......x....."
    for bar in range(BARS):
        sec = _section_of(s, bar)
        ch, root = (chords7[bar % 4], roots[bar % 4]) if sec != "end" else ([57, 60, 64, 67], 33)
        drums = sec in DRUM_SECTIONS or (sec == "outro" and bar < DRUMS_OUT_FROM)
        full = sec in ("drop1", "drop2", "hook")
        if drums:
            s.hits("kick", KICK_L, bar, S.kick, gain=0.9, punch=0.8)
            snare_pat = "........x......." if sec == "groove2" else FILLS.get(bar, SNR)
            s.hits("snare", snare_pat, bar, S.clap, gain=0.7)
            s.hits("snare", snare_pat, bar, S.snare, gain=0.35, bright=0.5)
            s.hits("hat", HAT_FULL if full else HAT_LITE, bar, S.hat, gain=0.35)
            s.hits("rim", RIM, bar, S.rim, gain=0.35)
            if bar in FLIPS[1:]:
                s.hits("hat", "o...............", bar, S.hat, gain=0.5)
                s.hits("snare", "x...............", bar, S.clap, gain=0.7)
        elif sec == "build":
            k = bar - 38
            s.hits("hat", ("x.x.x.x.x.x.x.x.", "x.x.x.x.xxxxxxxx", "xxxxxxxxxxxxxxxx")[k], bar, S.hat, gain=0.35)
            s.hits("snare", ("x...x...x...x...", "x.x.x.x.x.x.x.x.", "x.x.x.x.xxxxxxxx")[k], bar, S.clap, gain=0.5)
        elif sec in ("intro", "break"):
            s.hits("hat", "..x...x...x...x.", bar, S.hat, gain=0.3)
            if bar == 0: _impact(s)
        elif sec == "end":
            _end_hit(s)
        if drums or sec == "build":
            for i in ((0, 4, 6, 10) if full else (0, 6, 10)):
                s.note("bass", bar, i, S.bass_sub(root, s.beat * 0.7), 0.9)
        elif sec == "break":
            s.note("bass", bar, 0, S.bass_sub(root, s.bar * 0.9), 0.8)
        # keys: the chord on the downbeat, a low answer on the "and" of 2; a long chord on the end bar
        s.note("keys", bar, 0, S.rhodes(ch, s.beat * (3.2 if sec == "end" else 1.6)), 0.9)
        if sec != "end":
            s.note("keys", bar, 6, S.rhodes([m - 12 for m in ch[1:]] + [ch[3]], s.beat * 1.2), 0.6)
        # the melody: plucked, in the drops and the games section; a thinner one under project view
        if full or bar in LEAD_EARLY:
            for step, n, ln in LOFI_MELODY[bar % 2]:
                s.note("pluck", bar, step, S.pluck(n, s.beat / 4 * ln * 0.9, bright=1800), 0.5)
        if sec == "end":
            s.note("pluck", bar, 0, S.pluck(81, s.bar, bright=1600), 0.5)
    s.note("vinyl", 0, 0, S.vinyl(s.n, 0.05), 1.0)
    _risers(s, 0.25)
    _gap(s)
    return s


# ---- promo-pop: bright indie-pop — four-on-the-floor, disco hats, a plucked riff, a round lead
POP_HOOK = [
    [(0, 79, 2), (2, 81, 2), (4, 84, 4), (8, 83, 2), (10, 81, 2), (12, 79, 4)],
    [(0, 76, 3), (4, 79, 3), (8, 81, 6)],
    [(0, 84, 2), (2, 86, 2), (4, 88, 3), (8, 86, 2), (10, 84, 2), (12, 81, 4)],
    [(0, 79, 3), (4, 81, 3), (8, 83, 2), (10, 84, 2), (12, 88, 4)],
]


def promo_track_pop() -> Song:
    s = _plan_song()
    chords = [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]]      # C G/B Am F/A
    roots = [36, 31, 33, 29]
    HAT_DISCO, SHAKER, BASS_PAT = "x.o.x.o.x.o.x.o.", "xxxxxxxxxxxxxxxx", "x..x..x.x..x..x."
    for bar in range(BARS):
        sec = _section_of(s, bar)
        ch, root = (chords[bar % 4], roots[bar % 4]) if sec != "end" else ([60, 64, 67], 36)
        drums = sec in DRUM_SECTIONS or (sec == "outro" and bar < DRUMS_OUT_FROM)
        full = sec in ("drop1", "drop2", "hook")
        hook_from = {"drop1": 7, "hook": 29, "drop2": 20}.get(sec, LEAD_EARLY[0] if bar in LEAD_EARLY else None)
        if drums:
            s.hits("kick", KICK, bar, S.kick, punch=0.9)
            snare_pat = "........x......." if sec == "groove2" else FILLS.get(bar, SNR)
            s.hits("clap", snare_pat, bar, S.clap, gain=0.6)
            s.hits("snare", snare_pat, bar, S.snare, gain=0.4, bright=0.7)
            s.hits("hat", HAT_DISCO if full else "..x...x...x...x.", bar, S.hat, gain=0.4)
            if full: s.hits("shaker", SHAKER, bar, S.hat, gain=0.14)
            if bar in FLIPS[1:]:
                s.hits("hat", "o...............", bar, S.hat, gain=0.5)
                s.hits("clap", "x...............", bar, S.clap, gain=0.7)
        elif sec == "build":
            k = bar - 38
            s.hits("hat", ("x.x.x.x.x.x.x.x.", "x.x.x.x.xxxxxxxx", "xxxxxxxxxxxxxxxx")[k], bar, S.hat, gain=0.4)
            s.hits("snare", ("x...x...x...x...", "x.x.x.x.x.x.x.x.", "x.x.x.x.xxxxxxxx")[k], bar, S.snare, gain=0.5)
        elif sec in ("intro", "break"):
            s.hits("shaker", "x.x.x.x.x.x.x.x.", bar, S.hat, gain=0.12)
            if bar == 0: _impact(s)
        elif sec == "end":
            _end_hit(s)
        # bass: a funk line with octave pops
        if drums or sec == "build":
            for i, c in enumerate(BASS_PAT):
                if c == ".": continue
                n = root + (12 if i in (8, 14) else 0)
                s.note("bass", bar, i, S.bass_saw(n, s.beat / 4 * 1.7, cutoff=600, sweep=900), 0.9)
        elif sec == "break" or (sec == "outro" and bar >= DRUMS_OUT_FROM):
            s.note("bass", bar, 0, S.bass_sub(root, s.bar * 0.95), 0.8 if sec == "break" else 0.35)   # the drumless outro bar is lifted 5 dB after the mix
        # keys: bright stabs on the off-beats everywhere but the intro and the end; a held chord in the break
        # (the intro is pad-only: with the stabs and a sub under it, plus the 9 dB intro lift, bar 0-1 came out
        # LOUDER than the drops — measured 2026-09-09)
        if sec == "break":
            s.note("keys", bar, 0, S.rhodes(ch, s.bar * 1.02, tremolo=0.2), 0.8)
        elif sec == "intro":
            pass
        elif sec != "end":
            for step in (2, 6, 10, 14):
                s.note("keys", bar, step, S.rhodes([m + 12 for m in ch], s.beat * 0.4, tremolo=0.05), 0.5 if full else 0.4)
        else:
            s.note("keys", bar, 0, S.rhodes(ch + [ch[0] + 12], s.beat * 3.2), 0.9)
        # the riff: a guitar-ish pluck, 16ths through the chord, in every section with drums
        if drums and sec != "outro":
            tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12, ch[0] + 24, ch[2] + 12]
            for k, i in enumerate((0, 2, 4, 6, 7, 10, 12, 14)):
                if not full and k % 2: continue
                s.note("pluck", bar, i, S.pluck(tones[k % len(tones)], s.beat / 4 * 1.3, bright=2600 if full else 2000), 0.4)
        # pad: only under the drops, soft
        if full or sec in ("intro", "outro", "end"):
            s.note("pad", bar, 0, S.pad_supersaw([m + (12 if sec == "intro" else 0) for m in ch], s.bar * (2.4 if sec == "end" else 1.02), cutoff=1500), 0.3 if sec == "intro" else 0.55)
        # lead: the four-bar melody, round and whistly
        if hook_from is not None:
            k = bar - hook_from
            prev = None
            for step, n, ln in POP_HOOK[k % 4]:
                s.note("lead", bar, step, S.lead_soft(n, s.beat / 4 * ln * 0.95, glide_from=prev), 0.6); prev = n
        if sec == "end":
            s.note("lead", bar, 0, S.lead_soft(84, s.bar * 1.6), 0.5)
    _risers(s, 0.3)
    _gap(s)
    return s


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


# The UI sounds written next to the track: name -> generator. Every file is peak-normalised to
# -3 dBFS by the same master() call, so the video mixes them at one volume convention.
# sparkle1/2/3: the flips land on bars 7, 8, 9 of promo_track's Am F C G cycle — G, Am, F/A —
# so each sparkle arpeggiates the chord that is playing under it (in key by construction).
SFX = {"pop": S.sfx_pop, "whoosh": S.sfx_whoosh, "chime": S.sfx_chime,
       "punch": S.sfx_punch, "poof": S.sfx_poof, "step": S.sfx_step,
       "sparkle1": lambda: S.sfx_sparkle([55, 59, 62]), "sparkle2": lambda: S.sfx_sparkle([57, 60, 64]), "sparkle3": lambda: S.sfx_sparkle([57, 60, 65])}

TRACKS = {"promo": promo_track, "promo-lofi": promo_track_lofi, "promo-pop": promo_track_pop}


def _mix_settings(s: Song, style: str):
    """Per-style effects, gains and pans. The arp is low-passed (it pierced on a laptop speaker) and
    the pad is pumped by the kick; keys and plucks get room and a dotted echo."""
    pump = S.sidechain(s.n, s.kicks, depth=0.65 if style == "promo" else 0.4, recover=0.26)
    fx = {
        "arp": lambda x: S.delay(S.onepole_lp(x, 5200, 1), s.beat * 0.75, 0.3, 0.28),
        "pad": lambda x: S.reverb(x * pump, 0.9, 0.35, 0.35),
        "bass": lambda x: (x * pump) if style == "promo" else S.onepole_lp(x, 2500, 1),
        "snare": lambda x: S.reverb(x, 0.7, 0.3, 0.22),
        "clap": lambda x: S.reverb(x, 0.8, 0.2, 0.3),
        "crash": lambda x: S.reverb(x, 0.9, 0.3, 0.3),
        "lead": lambda x: S.delay(S.reverb(x, 0.8, 0.3, 0.25), s.beat * 0.5, 0.35, 0.3),
        "keys": lambda x: S.reverb(S.onepole_lp(x, 4200, 1), 0.85, 0.4, 0.3),
        "pluck": lambda x: S.delay(S.reverb(x, 0.8, 0.4, 0.22), s.beat * 0.75, 0.3, 0.25),
        "kick": lambda x: S.onepole_lp(x, 2500, 1) if style == "promo-lofi" else x,
    }
    gains = {"promo": {"kick": 1.0, "snare": 0.8, "clap": 0.5, "hat": 0.5, "bass": 0.7, "arp": 0.38, "pad": 0.5, "lead": 0.55, "riser": 0.5, "crash": 0.5, "keys": 0.5, "pluck": 0.45},
             "promo-lofi": {"kick": 1.0, "snare": 0.75, "hat": 0.45, "rim": 0.4, "bass": 0.8, "keys": 0.7, "pluck": 0.55, "vinyl": 1.0, "riser": 0.4, "crash": 0.4},
             "promo-pop": {"kick": 1.0, "snare": 0.6, "clap": 0.6, "hat": 0.5, "shaker": 0.6, "bass": 0.75, "keys": 0.55, "pluck": 0.5, "pad": 0.45, "lead": 0.6, "riser": 0.45, "crash": 0.45}}[style]
    pans = {"arp": (0.6, 0.2), "pad": (1.0, 0.0), "hat": (0.3, -0.25), "shaker": (0.3, 0.3), "lead": (0.5, -0.1), "crash": (0.8, 0.0),
            "keys": (0.8, 0.0), "pluck": (0.4, 0.25), "rim": (0.0, 0.3)}
    return fx, gains, pans


def render_promo(out: str, style: str = "promo"):
    s = TRACKS[style]()
    fx, gains, pans = _mix_settings(s, style)
    mixed = s.mix(gains, fx, pans)
    # Apply the lift after the full mix+master so it moves the finished mix, not one instrument, then
    # re-master (soft-clip + peak-normalize) since the boosted bars can otherwise exceed 0 dBFS.
    lift = _lift_envelope(s, LIFT_DB)[:, None]      # (n, 1) broadcasts over both channels
    mastered = S.master(mixed * lift)
    S.write_wav(out, mastered)
    if style == "promo":                            # the UI sounds are the same whichever track plays; write them once
        d = os.path.dirname(os.path.abspath(out))
        for name, make in SFX.items():
            S.write_wav(os.path.join(d, f"sfx-{name}.wav"), S.master(S.to_stereo(make()), -3.0))
    return s


if __name__ == "__main__":
    which, out = sys.argv[1], sys.argv[2]
    renders = {"sketch-a": render_a, "sketch-b": render_b}
    renders.update({k: (lambda o, k=k: render_promo(o, k)) for k in TRACKS})
    song = renders[which](out)
    with open(out.rsplit(".", 1)[0] + ".grid.json", "w") as f:
        json.dump(song.grid(), f, indent=1)
    print(f"wrote {out} ({song.bars} bars @ {song.bpm} BPM, {song.n / S.SR:.1f}s)")
