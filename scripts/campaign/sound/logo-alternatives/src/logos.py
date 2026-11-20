"""Eleven versions of the sound logo, side by side.

Every version is built on the same engine as the chosen logo (arrange.py, dsp.py,
instruments.py and master.py are copies from ../../felt-and-pulse/src/, unchanged apart from
where the piano recordings are read). Times here are in SECONDS (each Piece runs at 60 BPM,
so one "beat" is one second).

Shared rules for every version:
- the moment the name appears (the "landing") is the note at exactly LAND = 0.50 s;
- the pickup keeps the logo's rhythm: notes at 0.00, 0.25 and 0.50 s ("you-co-ded");
- nothing drum-like, no whoosh or riser, no high glassy jingle (Destin's rulings, RULES.md);
- each one fades on an equal-power curve to true silence at its last sample.

Each version returns (mix, piece, cfg). `piece.events` lists every note start, so build.py
can prove that every attack you hear is a note (no stray percussive sounds).
"""
import numpy as np

import arrange
import instruments as ins
import strings as st
from arrange import Piece
from dsp import SR, biquad, butter, fade, note, place
from master import lufs

LAND = 0.50
CELL = [(0.00, "Bb4"), (0.25, "G5"), (0.50, "F5")]
CELL_VEL = (0.50, 0.56, 0.72)   # the current logo's velocities: the third note is the accent

# WHY extra buses: a second piano, bowed strings and plucked strings each get their own level
# and reverb send, so a version can be balanced by rule (see LEVELS) rather than by guesswork.
for _b in ("piano2", "strings", "pizz"):
    if _b not in arrange.BUSES:
        arrange.BUSES.append(_b)
arrange.DEFAULT["gain"].update(piano2=1.0, strings=1.0, pizz=1.0)
arrange.DEFAULT["hall"].update(piano2=0.34, strings=0.30, pizz=0.26)
arrange.DEFAULT["room"].update(piano2=0.12, strings=0.0, pizz=0.10)


# ------------------------------------------------------------------ players

def new(length):
    p = Piece(60, length)
    p.events = []          # (seconds, what, midi) for every attack
    return p


def piano(p, t, nm, dur, vel, tone=0.0, bus="piano", pan_=0.0, pedal=True):
    m = note(nm)
    x = ins.felt_piano(m, vel, dur, pedal=pedal, tone=tone)
    # WHY: some recordings carry a faint low knock from the room or the instrument well below
    # the note (measured: the G5 recording has a thump 166 ms in, 30 dB down, which shows up
    # as a stray attack once nothing else covers it). A gentle high-pass far below each note
    # removes it without touching the note itself.
    x = butter(x, "highpass", max(30.0, 0.35 * 440 * 2 ** ((m - 69) / 12)), 2)
    if pan_:
        x = x * np.array([1 - max(pan_, 0), 1 + min(pan_, 0)])
    place(p.bus[bus], x, t)
    p.events.append((t, bus, m))


def cell(p, notes=CELL, vels=CELL_VEL, ring=2.4, octave=0, tone=0.0, bus="piano"):
    """you-co-ded on the felt piano. Each note is damped as the next arrives (with the pedal's
    short ring), so the landing note rings alone, exactly as in the current logo."""
    for i, (t, nm) in enumerate(notes):
        m = note(nm) + 12 * octave
        dur = (notes[i + 1][0] - t) if i + 1 < len(notes) else ring
        piano(p, t, m, dur, vels[i], tone=tone, bus=bus)


def chord(p, t, names, vels, roll=0.015, dur=2.4, tone=0.0, bus="piano"):
    """A landing chord, very slightly rolled (a human hand, not a machine block)."""
    for i, (nm, v) in enumerate(zip(names, vels)):
        piano(p, t + roll * i, nm, dur, v, tone=tone, bus=bus)


def narrow(x, width=0.6):
    """Narrow a stereo recording (side signal x width). WHY: the string recordings are wide
    section-and-hall takes; at full width they lose loudness when a phone plays them in mono."""
    mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2 * width
    return np.stack([mid + side, mid - side], axis=1)


def pizz(p, t, sec, nm, vel, rr=0, dur=None, pan_=0.0):
    x, early = st.pizz(sec, note(nm), vel, dur=dur, rr=rr)
    if t - early < 0:
        # the very first note: use the take whose pluck comes soonest, and round off whatever
        # lead-in is cut at the file start (8 ms), so the file still begins without a click
        x, early = min((st.pizz(sec, note(nm), vel, dur=dur, rr=k) for k in range(4)),
                       key=lambda c: c[1])
        cut = int(round((early - t) * SR))
        x = x.copy()
        x[cut:cut + int(0.008 * SR)] *= st.rcos(np.arange(int(0.008 * SR)) / SR, 0, 0.008)[:len(x[cut:cut + int(0.008 * SR)]), None]
    x = narrow(x)
    if pan_:
        x = x * np.array([1 - max(pan_, 0), 1 + min(pan_, 0)])
    # WHY early: start the recording before the beat so its audible pluck lands ON the beat
    # (at t = 0 the lead-in is simply cut; the file's 2 ms fade-in keeps the start silent)
    place(p.bus["pizz"], x, t - early)
    p.events.append((t, "pizz", note(nm)))


def swell(p, names, t0, peak, end, vel=0.45, rr=0):
    """A short string bloom: bowed notes that rise from nothing at t0, are fullest at `peak`
    and are gone by `end` (seconds in the file). No bow scrape (see strings.bowed)."""
    env = st.swell_env(0.0, peak - t0, end - t0)
    for i, nm in enumerate(names):
        x = st.bowed(note(nm), end - t0 + 0.05, env, vel, rr=rr + i)
        place(p.bus["strings"], narrow(x), t0)
    p.events.append((t0, "swell", None))


def legato(p, line, vel=0.45, overlap=0.06, fall=0.9):
    """A bowed line (violas/violins), notes joined without gaps: each note fades in over
    `overlap` seconds while the previous one fades out (no re-bowing accent).
    line = [(start, name, length)]; the last note dies away over `fall` seconds."""
    for k, (t, nm, d) in enumerate(line):
        last = k == len(line) - 1
        L = d + (fall if last else overlap)

        def env(tt, d=d, last=last, L=L):
            a = st.rcos(tt, 0.0, overlap)
            b = (1 - st.rcos(tt, d * 0.25, L)) if last else (1 - st.rcos(tt, d, d + overlap))
            return a * b
        place(p.bus["strings"], narrow(st.bowed(note(nm), L, env, vel, rr=k)), t)
        p.events.append((t, "bowed", note(nm)))


def soft_sub(p, t, nm, length=1.6, vel=0.8):
    """A round sine sub under the landing. WHY not the current logo's 'thump': that one drops
    in pitch like a kick drum, and Destin has ruled out kick and soft-thump sounds. This one
    holds its pitch and fades in over 30 ms, so it is felt as warmth, not heard as a hit."""
    f = 440.0 * 2 ** ((note(nm) - 69) / 12)
    n = int(length * SR)
    tt = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * tt) + 0.06 * np.sin(4 * np.pi * f * tt)
    x *= st.rcos(tt, 0.0, 0.03) * np.exp(-tt / 0.75) * vel
    x = fade(biquad(x, "lp", 200, 0.7), fout=0.05)
    place(p.bus["bass"], x, t)
    p.events.append((t, "sub", note(nm)))


def pad(p, t, chord_name, length, vel=0.5):
    # the chosen sound's analog pad, same settings as the current logo's bloom. WHY every
    # version starts it ON the landing (the current starts it 0.15 s early): measured, that
    # early entrance is its own little attack just ahead of the name.
    p.pad(t, chord_name, length, vel, cutoff=2400, attack=0.12, release=0.8)
    p.events.append((t, "pad", None))


# ------------------------------------------------------------------ mixing

def mixdown(p, levels, ref="piano", cfg=None, tail=0.9):
    """Set each bus's level relative to the reference bus (the lead), in loudness units.

    `levels` maps bus -> dB relative to `ref` (measured as LUFS of the dry bus over the whole
    logo). WHY by rule: I cannot listen, so balance is stated as numbers you can change: e.g.
    strings -6 means the strings are 6 dB quieter than the piano on a loudness meter.
    """
    ref_l = lufs(p.bus[ref])
    gain = {ref: 1.0}
    for b, rel in levels.items():
        if np.abs(p.bus[b]).max() > 1e-9:
            gain[b] = float(10 ** ((ref_l + rel - lufs(p.bus[b])) / 20))
    c = dict(gain=gain)
    for k, v in (cfg or {}).items():
        c[k] = v
    mix = p.render(c, end_fade=0.0)
    # end cleanly: equal-power fade to true silence over the last `tail` seconds
    t = np.arange(len(mix)) / SR
    u = np.clip((p.length - t) / tail, 0, 1)
    mix *= (np.sin(0.5 * np.pi * u) ** 2)[:, None]
    mix[-1] = 0.0
    p.levels = levels
    return mix


ROOMY = dict(hall_return=0.55)


# ------------------------------------------------------------------ the versions

def v02_piano_only():
    """Just the felt piano: the three notes and an open E-flat in the left hand. No pad, no
    sub, no echo, a little less reverb. As close and intimate as the sound gets."""
    p = new(2.5)
    cell(p, tone=-0.15)
    chord(p, LAND, ["Eb2", "Bb2", "G3"], (0.42, 0.30, 0.27), tone=-0.15)
    return mixdown(p, {}, cfg=dict(hall=dict(piano=0.22), room=dict(piano=0.14))), p


def v03_piano_no_echo():
    """The current logo minus the high glass echo. Also minus its two small effects that
    Destin's rulings now forbid: the kick-like 'thump' (replaced by a round sub that holds its
    pitch) and the little noise swell into the landing (a mini whoosh)."""
    p = new(2.5)
    cell(p)
    chord(p, LAND, ["Eb2", "Eb3"], (0.40, 0.32), roll=0.03)
    pad(p, LAND, "Eb open", 1.5, 0.55)
    soft_sub(p, LAND, "Eb2")
    return mixdown(p, dict(pad=-6.5, bass=-4.0),
                   cfg=dict(hall=dict(piano=0.30, pad=0.35))), p


def v04_piano_answered_by_piano():
    """The three notes, then a second, darker piano answers them an octave lower and a little
    slower, as if someone across the room repeats it back. Replaces the glass echo."""
    p = new(2.8)
    cell(p)
    chord(p, LAND, ["Eb2", "Eb3"], (0.40, 0.32), roll=0.03)
    pad(p, LAND, "Eb open", 1.8, 0.5)
    soft_sub(p, LAND, "Eb2", 1.8)
    for k, (t, nm) in enumerate([(1.00, "Bb3"), (1.30, "G4"), (1.60, "F4")]):
        piano(p, t, nm, 0.3 if k < 2 else 1.2, (0.38, 0.40, 0.44)[k], tone=-0.7, bus="piano2",
              pan_=-0.25)
    return mixdown(p, dict(piano2=-5.0, pad=-8.0, bass=-4.5),
                   cfg=dict(hall=dict(piano=0.30, pad=0.35, piano2=0.40))), p


def v05_piano_and_pizzicato():
    """The piano plays the three notes with plucked violins doubling it (the same notes, a
    plucked edge on each), and plucked cellos give the landing its low E-flat in place of the
    sub. Lighter and more playful than the current."""
    p = new(2.5)
    cell(p)
    for k, (t, nm) in enumerate(CELL):
        pizz(p, t, "vln", nm, (0.42, 0.46, 0.52)[k], rr=k, pan_=(0.08, -0.05, 0.0)[k])
    pizz(p, LAND, "vc", "Eb2", 0.62)
    pizz(p, LAND + 0.01, "vla", "Bb3", 0.40, pan_=0.2)
    chord(p, LAND, ["Eb2", "G3"], (0.34, 0.26), roll=0.02)
    pad(p, LAND, "Eb open", 1.5, 0.45)
    return mixdown(p, dict(pizz=-4.5, pad=-9.0),
                   cfg=dict(hall=dict(piano=0.28, pad=0.35, pizz=0.30))), p


def v06_piano_and_string_swell():
    """The three notes land into a short, warm string swell (violas and violins, E-flat major,
    voiced under the piano's F so the tune stays on top) that blooms for about a second and
    fades. The piano is the voice; the strings are the room filling with warmth."""
    p = new(3.0)
    cell(p)
    chord(p, LAND, ["Eb2", "Eb3"], (0.40, 0.30), roll=0.03)
    swell(p, ["Eb3", "Bb3", "G4", "Eb5"], 0.30, 1.25, 2.95, vel=0.5)
    soft_sub(p, LAND, "Eb2", 2.0)
    return mixdown(p, dict(strings=-4.0, bass=-4.0), tail=1.0,
                   cfg=dict(hall=dict(piano=0.30, strings=0.32))), p


def v07_strings_lead():
    """Strings take the tune: plucked violins play you-co-ded, and on the landing the violins
    keep the F singing as a bowed note while violas fill in; the piano only plays the chord
    underneath (E-flat, low and soft). The piano steps back to accompanist."""
    p = new(2.8)
    # WHY +4 ms: with no piano on the tune, the plucks alone measured 4 ms ahead of the
    # landing mark; nudged so the name and the pluck meet at 0.50 s
    for k, (t, nm) in enumerate(CELL):
        pizz(p, t + 0.004, "vln", nm, (0.58, 0.62, 0.70)[k], rr=k)
    swell(p, ["F5"], LAND - 0.02, LAND + 0.45, 2.75, vel=0.55, rr=1)
    swell(p, ["Bb3", "Eb4"], LAND, LAND + 0.6, 2.75, vel=0.42, rr=3)
    chord(p, LAND, ["Eb2", "Bb2", "G3", "Eb4"], (0.42, 0.32, 0.30, 0.26), roll=0.02, dur=2.2,
          bus="piano2")
    pizz(p, LAND, "vc", "Eb2", 0.55)
    return mixdown(p, dict(strings=-2.0, piano2=-3.0), ref="pizz",
                   cfg=dict(hall=dict(pizz=0.34, strings=0.30, piano2=0.30))), p


def v08_two_notes():
    """Shorter and bolder for 5-second ads: just "co-ded" (G then F), each played in octaves,
    landing on a firmer E-flat with plucked cello and sub, gone in two seconds."""
    p = new(2.0)
    for (t, nm), v in zip(CELL[1:], (0.62, 0.78)):
        piano(p, t, nm, 0.25 if nm == "G5" else 1.6, v)
        piano(p, t + 0.004, note(nm) - 12, 0.25 if nm == "G5" else 1.6, v * 0.75)
    chord(p, LAND, ["Eb2", "Bb2", "Eb3"], (0.48, 0.36, 0.34), roll=0.012, dur=1.6)
    pizz(p, LAND, "vc", "Eb2", 0.6)
    soft_sub(p, LAND, "Eb2", 1.3)
    return mixdown(p, dict(pizz=-7.0, bass=-5.0), tail=0.8,
                   cfg=dict(hall=dict(piano=0.26, pizz=0.26))), p


def v09_rising():
    """Same rhythm, but the third note goes UP (B-flat, G, high B-flat) and lands on A-flat
    major with a ninth: open, hopeful, "still going somewhere" rather than finished. A soft
    string swell carries it upward."""
    p = new(2.8)
    # WHY 0.496: the high B-flat recording speaks about 4 ms slower than the F (measured by
    # build.py's landing check), so it is struck 4 ms early to be HEARD at 0.50 s
    cell(p, notes=[(0.00, "Bb4"), (0.25, "G5"), (0.496, "Bb5")], vels=(0.50, 0.56, 0.70))
    chord(p, LAND, ["Ab2", "Eb3", "C4"], (0.40, 0.30, 0.28), roll=0.02)
    swell(p, ["Ab3", "Eb4", "C5", "G5"], 0.35, 1.3, 2.75, vel=0.45)
    soft_sub(p, LAND, "Ab1", 1.8)
    # WHY bass -9: the A-flat sub sits at 52 Hz, where it carries far more weight than the
    # E-flat (78 Hz) of the other versions; at -4 it measured boomy (40-80 Hz only 1.7 dB
    # under the whole mix)
    return mixdown(p, dict(strings=-6.0, bass=-9.0),
                   cfg=dict(hall=dict(piano=0.30, strings=0.32))), p


def v10_full_blend():
    """Everything he said yes to, kept sparse: piano tune with plucked violins doubling it
    softly, a plucked cello and round sub under the landing, a warm string swell, and the
    second piano answering low. Rich, but each part has its own moment."""
    p = new(3.0)
    cell(p)
    for k, (t, nm) in enumerate(CELL):
        pizz(p, t, "vln", nm, (0.38, 0.42, 0.48)[k], rr=k)
    chord(p, LAND, ["Eb2", "Eb3"], (0.38, 0.28), roll=0.03)
    pizz(p, LAND, "vc", "Eb2", 0.55)
    soft_sub(p, LAND, "Eb2", 2.0, 0.7)
    swell(p, ["Eb3", "Bb3", "G4", "Eb5"], 0.35, 1.35, 2.95, vel=0.45)
    for k, (t, nm) in enumerate([(1.05, "Bb3"), (1.35, "G4"), (1.65, "F4")]):
        piano(p, t, nm, 0.3 if k < 2 else 1.2, (0.36, 0.38, 0.42)[k], tone=-0.7, bus="piano2",
              pan_=-0.25)
    return mixdown(p, dict(pizz=-6.0, strings=-6.0, piano2=-7.0, bass=-5.0), tail=1.0,
                   cfg=dict(hall=dict(piano=0.30, pizz=0.30, strings=0.32, piano2=0.40))), p


def v11_piano_answered_by_strings():
    """Extra. The piano asks; bowed violas answer it, low and joined-up (B-flat, G, F an
    octave down, slower), like a cello-ish voice saying it back. The glass echo's role, but
    warm and human, below the tune instead of above it."""
    p = new(3.0)
    cell(p)
    chord(p, LAND, ["Eb2", "Bb2", "G3"], (0.40, 0.28, 0.24), roll=0.02)
    soft_sub(p, LAND, "Eb2", 1.8)
    legato(p, [(0.95, "Bb3", 0.32), (1.27, "G4", 0.32), (1.59, "F4", 1.1)], vel=0.5)
    return mixdown(p, dict(strings=-4.0, bass=-4.0), tail=1.0,
                   cfg=dict(hall=dict(piano=0.28, strings=0.34))), p


VERSIONS = {
    "02-piano-only": v02_piano_only,
    "03-piano-no-echo": v03_piano_no_echo,
    "04-piano-answered-by-piano": v04_piano_answered_by_piano,
    "05-piano-and-pizzicato": v05_piano_and_pizzicato,
    "06-piano-and-string-swell": v06_piano_and_string_swell,
    "07-strings-lead": v07_strings_lead,
    "08-two-notes": v08_two_notes,
    "09-rising": v09_rising,
    "10-full-blend": v10_full_blend,
    "11-piano-answered-by-strings": v11_piano_answered_by_strings,
}
