"""The score: the motif, the logo, three demos and four interface sounds.

The motif and the logo are defined ONCE here and reused note-for-note everywhere.
"""
import numpy as np
from dsp import (SR, secs, add_at, pan, reverb, make_ir, pingpong, filt, butter, sidechain,
                 compress, release_tail, fade_edges, attack_ramp, exp_decay, undb)
import instruments as I

KEY = "D lydian (D major with a raised 4th, G#: the cheeky lift)"

# ------------------------------------------------------------------ THE MOTIF
# (beat, length in beats, MIDI note). Music box plays these exact pitches, A5..A6.
PHRASE_A = [(0, .5, 81), (.5, .5, 86), (1, 1, 90), (2, .5, 88), (2.5, .5, 92), (3, 1, 93)]
PHRASE_B = [(0, .5, 90), (.5, .5, 88), (1, 1, 86), (2, .5, 83), (2.5, .5, 85), (3, 1, 86)]
# Chords under each half-bar: (beat, beats, bass MIDI, pad voicing)
CHORDS_A = [(0, 2, 38, [62, 66, 69, 76]),   # D add9
            (2, 2, 38, [62, 68, 71, 76])]   # E/D  (the lydian colour)
CHORDS_B = [(0, 2, 35, [59, 62, 66, 69]),   # Bm7
            (2, 1, 31, [59, 62, 67, 71]),   # G
            (3, 1, 33, [61, 64, 69, 76])]   # A
# THE LOGO: the motif's own cadence. A5, D6, then the G#6 -> A6 flick, landing on a big D.
LOGO_NOTES = [(0.16, 81), (0.38, 86), (0.58, 92), (0.64, 93)]
LOGO_HIT = 0.64
LOGO_LEN = 2.6

MOTIF_LOG = {}  # piece -> list of (time_s, midi) for every music-box motif note (for verify)


def new(seconds):
    return np.zeros((secs(seconds), 2))


def box_pan(m):
    return float(np.clip((m - 86) / 9.0, -0.75, 0.75))  # like sitting in front of the comb


def play_phrase(buf, phrase, t0, beat, piece, vel=1.0, human=True, seed=0, log=True, octave=0):
    rng = np.random.default_rng(seed)
    for i, (b, l, m) in enumerate(phrase):
        jt = rng.uniform(-0.003, 0.003) if human else 0.0
        v = vel * (rng.uniform(0.88, 1.0) if human else 1.0)
        if i in (0, 2, 5):
            v *= 1.08  # tiny accent on the shape's strong notes
        note = I.music_box(m + octave, v, seed=seed * 31 + i)
        add_at(buf, pan(note, box_pan(m)), t0 + b * beat + jt)
        if log:
            MOTIF_LOG.setdefault(piece, []).append((round(t0 + b * beat + jt, 4), m + octave))


# ------------------------------------------------------------------ the logo
def render_logo():
    """Built deterministically (no randomness) so it is bit-identical everywhere."""
    n = secs(LOGO_LEN)
    box = np.zeros((n, 2)); glass = np.zeros((n, 2)); low = np.zeros((n, 2)); synth = np.zeros((n, 2))
    mech = I.ratchet(3, 0.11, 0.85, 1.04, seed=11, amp=0.16)
    add_at(box, pan(mech, -0.15), 0.012)
    for i, (t, m) in enumerate(LOGO_NOTES):
        grace = (i == 2)
        v = 0.55 if grace else (1.15 if i == 3 else 0.95)
        add_at(box, pan(I.music_box(m, v, seed=500 + i), box_pan(m)), t)
        if not grace:
            add_at(glass, pan(I.glass(m + 12, 0.45 if i < 3 else 0.7, seed=600 + i), -box_pan(m)), t)
    h = LOGO_HIT
    # the power underneath: one 808 drop + kick on the landing note
    add_at(low, pan(I.kick(0.95), 0.0), h)
    add_at(low, pan(I.bass808(38, 1.85, 0.95, glide_from=45, floor=0.05, t60=2.6), 0.0), h)
    # the bloom: a short bright chord on glass, and a saw chord that opens and closes
    for j, m in enumerate([86, 90, 93, 100]):
        add_at(glass, pan(I.glass(m, 0.42, dur=1.9, seed=700 + j), [-0.5, 0.5, -0.2, 0.3][j]), h + 0.012 * j)
    for j, m in enumerate([62, 69, 74, 78, 81]):
        add_at(synth, I.lead(m, 0.55, 0.32, bright=0.7, seed=800 + j), h)
    MOTIF_LOG.setdefault("logo", []).extend([(t, m) for t, m in LOGO_NOTES])
    ir = make_ir(2.0, 0.015, 1.1, seed=21)
    dry = box * 1.0 + glass * 0.9 + low * 1.0 + synth * 0.55
    wet = reverb(box * 1.0 + glass * 1.0 + synth * 0.7, ir, 0.2)
    wet += pingpong(box[:, 0] + box[:, 1], 0.25, 0.3, 4, 5000, 0.12)
    out = dry + wet
    out = polish(out)
    out *= release_tail(n, 1.85, 0.72)[:, None]  # ends cleanly on silence at 2.6 s
    return fade_edges(out, 0.001, 0.01)


# ------------------------------------------------------------------ motif.wav
def render_motif(logo):
    beat = 60 / 90
    length = 0.12 + 8 * beat + 0.15 + LOGO_LEN
    buf = new(length)
    t0 = 0.12
    play_phrase(buf, PHRASE_A, t0, beat, "motif", seed=1)
    play_phrase(buf, PHRASE_B, t0 + 4 * beat, beat, "motif", seed=2)
    ir = make_ir(2.0, 0.015, 1.1, seed=21)
    buf = buf + reverb(buf, ir, 0.22)
    lt = t0 + 8 * beat + 0.15
    return buf, logo, lt


# ------------------------------------------------------------------ helpers for beds
def chords_for(phrase_name):
    return CHORDS_A if phrase_name == "A" else CHORDS_B


def lay_pad(buf, t_bar, beat, which, vel, cutoff, voice_dip=False, seed=0):
    for k, (b, l, bass, voicing) in enumerate(chords_for(which)):
        p = I.pad(voicing, l * beat + 0.05, vel, attack=0.45, release=0.9, cutoff=cutoff, seed=seed + k)
        if voice_dip:
            # WHY: carve the speech band so a narrator sits on top of the music, not inside it
            p = filt(p, "peak", 2400, 0.7, -5.0)
            p = filt(p, "peak", 900, 0.9, -2.0)
        add_at(buf, p, t_bar + b * beat)


def lay_bass(buf, t_bar, beat, which, vel=1.0):
    for b, l, bass, voicing in chords_for(which):
        add_at(buf, pan(I.bass808(bass, l * beat - 0.04, vel), 0.0), t_bar + b * beat)


def polish(x):
    """Master tone: clear the rumble below 30 Hz, lift the 'air' above 9 kHz a little."""
    x = filt(x, "hp", 30, 0.7)
    x = filt(x, "peak", 4200, 0.6, 2.0)
    x = filt(x, "highshelf", 9000, 0.7, 3.0)
    return x


def finish_bed(bed, logo_t, total):
    """Bed fades to silence 0.25 s after the logo starts, so the logo stays itself."""
    env = release_tail(len(bed), logo_t + 0.03, 0.22)
    bed = bed * env[:, None]
    return fade_edges(bed, 0.001, 0.01)


# ------------------------------------------------------------------ demo: hopeful (30 s)
def render_hopeful():
    bpm = 90; beat = 60 / bpm; bar = 4 * beat; total = 30.0
    logo_t = total - LOGO_LEN - 0.04  # WHY: the logo landing hit falls exactly on a beat (x.00 s)
    box = new(total); kal = new(total); gl = new(total); padb = new(total)
    bass = new(total); drums = new(total); kickb = new(total); leadb = new(total)
    rng = np.random.default_rng(5)

    def which(bi):
        return "A" if bi % 2 == 0 else "B"

    for bi in range(10):
        t = bi * bar
        w = which(bi)
        if bi <= 1:  # intimate opening: the music box alone, a breath of pad
            play_phrase(box, PHRASE_A if w == "A" else PHRASE_B, t, beat, "hopeful", 0.6, seed=10 + bi)
            lay_pad(padb, t, beat, w, 0.25, 1200, seed=20 + bi)
        elif bi <= 5:  # under the narrator: warm, low, sparse
            lay_pad(padb, t, beat, w, 0.55, 1500, voice_dip=True, seed=20 + bi)
            for b, l, bn, voicing in chords_for(w):
                add_at(bass, pan(I.bass808(bn, l * beat - 0.05, 0.55), 0), t + b * beat)
            # kalimba 3+3+2 ostinato on chord tones, an octave below the music box
            for k, (b, l, bn, voicing) in enumerate(chords_for(w)):
                tones = [voicing[0], voicing[2], voicing[1] + 12]
                steps = [0, 0.75, 1.5] if l >= 2 else [0, 0.5]
                for s, tt in zip(steps, tones):
                    add_at(kal, pan(I.kalimba(tt, 0.5 + 0.1 * rng.random(), seed=bi * 10 + k), -0.35 + 0.35 * (tt % 3) / 2), t + (b + s) * beat)
            if bi in (3, 5):  # a fragment of the motif answers the voice at the end of the bar
                frag = [(2 + x[0] * 0.5, x[1], x[2]) for x in PHRASE_A[:3]]
                play_phrase(box, frag, t, beat, "hopeful-frag", 0.7, seed=40 + bi, log=False)
            add_at(gl, pan(I.glass(98 if w == "A" else 95, 0.25, seed=bi), 0.4), t)
        elif bi <= 7:  # the build
            play_phrase(box, PHRASE_A if w == "A" else PHRASE_B, t, beat, "hopeful", 1.0, seed=10 + bi)
            for b, l, m in (PHRASE_A if w == "A" else PHRASE_B):
                add_at(gl, pan(I.glass(m + 12, 0.3, seed=bi * 7 + int(b * 2)), -box_pan(m)), t + b * beat)
            lay_pad(padb, t, beat, w, 0.7, 2200 + 600 * (bi - 6), seed=20 + bi)
            lay_bass(bass, t, beat, w, 0.8)
            for b in (0, 2):
                add_at(kickb, pan(I.kick(0.7), 0), t + b * beat)
            for e in range(8):
                add_at(drums, pan(I.hat(0.35 + 0.15 * (e % 2 == 0), seed=e), 0.25), t + e * 0.5 * beat)
        else:  # grand, not pompous: the warm lead sings the motif, music box on top
            ph = PHRASE_A if w == "A" else PHRASE_B
            play_phrase(box, ph, t, beat, "hopeful", 1.05, seed=10 + bi)
            for b, l, m in ph:
                add_at(leadb, I.lead(m - 12, l * beat * 0.95, 0.62, bright=0.9, seed=bi * 13 + int(b * 2)), t + b * beat)
                add_at(gl, pan(I.glass(m + 12, 0.32, seed=bi * 9 + int(b * 2)), -box_pan(m)), t + b * beat)
            lay_pad(padb, t, beat, w, 0.8, 3200, seed=20 + bi)
            lay_bass(bass, t, beat, w, 0.95)
            last = (bi == 9)
            for b in (0, 2) if not last else (0,):
                add_at(kickb, pan(I.kick(0.85), 0), t + b * beat)
            add_at(drums, pan(I.snap(0.55, seed=bi), 0.0), t + 2 * beat)
            hats = 16 if not last else 8
            for e in range(hats):
                add_at(drums, pan(I.hat(0.28 + 0.2 * (e % 4 == 2), seed=e + 3), 0.3), t + e * 0.25 * beat)
    # the held D before the logo
    add_at(padb, I.pad([62, 66, 69, 76], 0.7, 0.6, attack=0.05, release=0.5, cutoff=2400, seed=99), 10 * bar)

    hall = make_ir(2.6, 0.022, 1.0, seed=31)
    bass = sidechain(bass, kickb, 4.0)
    padb = sidechain(padb, kickb, 3.0)
    dry = box * 1.0 + kal * 0.9 + gl * 0.8 + padb * 1.0 + bass * 1.0 + drums * 0.8 + kickb * 1.0 + leadb * 0.8
    wet = reverb(box + gl + kal * 0.6 + padb * 0.5 + leadb * 0.6 + drums * 0.3, hall, 0.22)
    wet += pingpong(box, beat * 0.75, 0.3, 4, 4500, 0.10)
    bed = dry + wet
    bed = polish(bed)
    bed = compress(bed, -16, 1.8, 0.015, 0.2)
    return finish_bed(bed, logo_t, total), logo_t, total


# ------------------------------------------------------------------ demo: playful (20 s, 120 BPM)
def render_playful():
    bpm = 120; beat = 0.5; bar = 2.0; total = 20.0
    logo_t = total - LOGO_LEN - 0.04  # WHY: the logo landing hit falls exactly on a beat (x.00 s)
    box = new(total); kal = new(total); gl = new(total); padb = new(total)
    bass = new(total); drums = new(total); kickb = new(total); leadb = new(total); mech = new(total)

    # bar 0: winding up the machine
    add_at(mech, pan(I.ratchet(7, 0.9, 0.82, 1.03, seed=2, amp=0.22), -0.2), 0.02)
    for e in range(4):
        add_at(kal, pan(I.kalimba([62, 69, 74, 69][e], 0.55, seed=e), [-0.3, 0.2, 0.4, 0.2][e]), 1.0 + e * 0.25)
    for e in range(4):
        add_at(drums, pan(I.hat(0.4, seed=e), 0.25), 1.0 + e * 0.25)

    for bi in range(1, 8):
        t = bi * bar
        w = "A" if bi % 2 == 1 else "B"
        ph = PHRASE_A if w == "A" else PHRASE_B
        full = bi >= 3
        if bi <= 6:
            play_phrase(box, ph, t, beat, "playful", 1.0, seed=60 + bi)
        if bi in (3, 4):  # kalimba answers, a sixth below
            for b, l, m in ph:
                add_at(kal, pan(I.kalimba(m - 21, 0.5, seed=bi * 5 + int(b * 2)), -0.4), t + b * beat + 0.25)
        if bi in (5, 6):  # the big moment: square lead sings the motif
            for b, l, m in ph:
                add_at(leadb, I.lead(m - 12, l * beat * 0.85, 0.6, bright=1.0, kind="square", seed=bi * 11 + int(b * 2)), t + b * beat)
        if bi == 7:  # call and response sparkle
            arp = [74, 78, 81, 86, 90, 93, 98, 93, 90, 86, 81, 78, 81, 86, 92, 93]
            for e, m in enumerate(arp):
                add_at(gl if e % 2 else box, pan(I.glass(m, 0.35, dur=0.9, seed=e) if e % 2 else I.music_box(m, 0.7, seed=e), (-0.5 if e % 2 else 0.5)), t + e * 0.125)
        # drums
        if bi <= 2:
            for e in range(8):
                add_at(drums, pan(I.hat(0.35 + 0.15 * (e % 2 == 0), seed=e), 0.25), t + e * 0.25)
            add_at(drums, pan(I.snap(0.5, seed=bi), 0.05), t + 1.5)
            if bi == 2:
                add_at(mech, pan(I.ratchet(5, 0.4, 0.75, 1.05, seed=9, amp=0.2), 0.2), t + 1.6)
        else:
            for kb in ((0, 1.5, 2.5) if bi % 2 else (0, 1.75, 2.5, 3.25)):
                add_at(kickb, pan(I.kick(0.9), 0), t + kb * beat)
            for sb in (1, 3):
                add_at(drums, pan(I.snap(0.65, seed=bi * 3 + sb), 0.05), t + sb * beat)
            for e in range(8):
                add_at(drums, pan(I.hat(0.3 + 0.2 * (e % 2 == 1), seed=e + bi), 0.3), t + e * 0.25)
            if bi % 2 == 0:  # a tiny 16th roll at the end of every second bar
                for r in range(4):
                    add_at(drums, pan(I.hat(0.2 + 0.08 * r, seed=r), 0.35), t + 3.5 * beat + r * 0.0625)
        # bass + pad
        if bi >= 2:
            for b, l, bn, voicing in chords_for(w):
                add_at(bass, pan(I.bass808(bn + (0 if bi < 3 else 0), l * beat - 0.03, 0.9 if full else 0.6), 0), t + b * beat)
        if bi >= 3:
            lay_pad(padb, t, beat, w, 0.5, 2600, seed=bi)
    # bar 8 (16.0-17.4): the break: everything stops, the key winds up, the logo answers
    add_at(mech, pan(I.ratchet(9, 1.1, 0.8, 1.035, seed=4, amp=0.24), 0.0), 16.1)
    add_at(gl, pan(I.glass(93, 0.3, seed=3), 0.5), 16.0)
    add_at(bass, pan(I.bass808(38, 0.6, 0.8), 0), 16.0)
    add_at(kickb, pan(I.kick(0.9), 0), 16.0)

    room = make_ir(1.5, 0.012, 1.1, seed=41)
    bass = sidechain(bass, kickb, 6.0)
    padb = sidechain(padb, kickb, 5.0)
    dry = box * 1.0 + kal * 0.9 + gl * 0.8 + padb * 0.8 + bass * 1.0 + drums * 0.9 + kickb * 1.0 + leadb * 0.75 + mech * 1.0
    wet = reverb(box + gl + kal * 0.5 + padb * 0.4 + leadb * 0.4 + drums * 0.2 + mech * 0.3, room, 0.18)
    wet += pingpong(box + leadb * 0.5, beat * 0.75, 0.3, 4, 5000, 0.10)
    bed = polish(dry + wet)
    bed = compress(bed, -14, 2.0, 0.008, 0.12)
    return finish_bed(bed, logo_t, total), logo_t, total


# ------------------------------------------------------------------ demo: stark (12 s)
def render_stark():
    total = 12.0; logo_t = total - LOGO_LEN; beat = 60 / 90
    dry = new(total); box = new(total); gl = new(total); low = new(total); padb = new(total); drums = new(total)
    # 0-7 s: deadpan. A clock, one music box, no reverb, dead centre.
    for k in range(int(7.0 / beat)):
        add_at(dry, pan(I.tick(k % 2 == 0, seed=k, amp=0.42), 0.0), 0.02 + k * beat)
    rng = np.random.default_rng(3)
    for i, (b, l, m) in enumerate(PHRASE_A):
        t = 0.02 + 2 * beat + b * beat
        add_at(dry, pan(I.music_box(m, 0.9, seed=900 + i), 0.0), t)
        MOTIF_LOG.setdefault("stark", []).append((round(t, 4), m))
    add_at(dry, pan(I.ratchet(6, 0.5, 0.78, 1.04, seed=8, amp=0.2), 0.0), 6.45)
    # 7.0 s: bright. Same notes, now wide, warm and loud.
    t7 = 7.0; b2 = 0.5
    add_at(low, pan(I.kick(1.0), 0), t7)
    add_at(low, pan(I.bass808(38, 2.25, 1.0, glide_from=45, floor=0.15, t60=2.4), 0), t7)
    add_at(padb, I.pad([62, 66, 69, 76, 81], 2.1, 0.9, attack=0.03, release=0.5, cutoff=4200, seed=5), t7)
    for j, m in enumerate([86, 90, 93, 100, 105]):
        add_at(gl, pan(I.glass(m, 0.4, seed=j), [-0.6, 0.6, -0.3, 0.3, 0][j]), t7 + 0.015 * j)
    for i, (b, l, m) in enumerate(PHRASE_B):
        t = t7 + b * b2
        add_at(box, pan(I.music_box(m, 1.0, seed=950 + i), box_pan(m)), t)
        add_at(gl, pan(I.glass(m + 12, 0.3, seed=960 + i), -box_pan(m)), t)
        MOTIF_LOG.setdefault("stark", []).append((round(t, 4), m))
    for e in range(16):
        add_at(drums, pan(I.hat(0.25 + 0.15 * (e % 2 == 0), seed=e), 0.3), t7 + e * 0.125)
    add_at(drums, pan(I.snap(0.5), 0), t7 + 1.0)
    add_at(low, pan(I.kick(0.8), 0), t7 + 1.0 * 2)
    hall = make_ir(2.2, 0.018, 1.2, seed=51)
    bright = box + gl * 0.9 + padb * 0.8 + low + drums * 0.8
    bright = bright + reverb(box + gl + padb * 0.5, hall, 0.24)
    bed = dry + bright
    bed = polish(bed)
    return finish_bed(bed, logo_t, total), logo_t, total


# ------------------------------------------------------------------ interface sounds
def sfx_type_tick():
    """One soft key tick: a single ratchet tooth with a whisper of high tine."""
    n = secs(0.09)
    y = np.zeros(n)
    c = I._click((3400, 5600), decay=0.008, seed=77, amp=0.5)
    y[secs(0.004): secs(0.004) + min(n, len(c))] += c[: n - secs(0.004)]
    ring = I.music_box(105, 0.25, dur=0.09, seed=78) * 0.25
    y += ring[:n]
    y = filt(y, "hp", 600, 0.7)
    return fade_edges(np.stack([y, y], 1) * np.sqrt(0.5), 0.0005, 0.008)


def sfx_change():
    """Something transforms (~0.8 s): the key winds, then a glass run up D-F#-A-D-E with a soft sub."""
    total = 0.85
    buf = new(total)
    add_at(buf, pan(I.ratchet(5, 0.22, 0.8, 1.05, seed=12, amp=0.22), -0.2), 0.0)
    for i, m in enumerate([86, 90, 93, 98, 100]):
        t = 0.2 + i * 0.055
        add_at(buf, pan(I.glass(m, 0.5 + 0.08 * i, dur=0.62, seed=i), -0.5 + 0.25 * i), t)
        add_at(buf, pan(I.music_box(m - 12, 0.5, dur=0.6, seed=i + 20), 0.5 - 0.25 * i), t)
    add_at(buf, pan(I.bass808(50, 0.35, 0.35), 0), 0.2)
    buf = buf + reverb(buf, make_ir(1.2, 0.01, 1.2, seed=61), 0.18)
    buf *= release_tail(len(buf), total - 0.3, 0.3)[:, None]
    return fade_edges(buf, 0.0005, 0.01)


def sfx_arrive():
    """Something appears (~0.4 s): the logo's last two notes, D6 -> A6, as a quick two-tone."""
    total = 0.42
    buf = new(total)
    add_at(buf, pan(I.music_box(86, 0.7, dur=0.4, seed=31), -0.15), 0.0)
    add_at(buf, pan(I.music_box(93, 0.9, dur=0.34, seed=32), 0.15), 0.07)
    add_at(buf, pan(I.glass(105, 0.25, dur=0.34, seed=33), 0.3), 0.07)
    add_at(buf, pan(I.kalimba(62, 0.35, dur=0.33, seed=34), 0), 0.07)
    buf = buf + reverb(buf, make_ir(0.9, 0.008, 1.2, seed=62), 0.12)
    buf *= release_tail(len(buf), total - 0.16, 0.16)[:, None]
    return fade_edges(buf, 0.0005, 0.008)


def sfx_strike():
    """A marker stroke on paper (~0.25 s): felt-tip friction noise with paper grain and a soft squeak."""
    total = 0.25
    n = secs(total)
    rng = np.random.default_rng(91)
    t = np.arange(n) / SR
    nz = rng.standard_normal(n)
    # paper grain: the noise is chopped by tiny random fibres (amplitude roughness)
    grain = butter(rng.standard_normal(n), "lowpass", 180, 2)
    grain = 0.6 + 0.4 * np.tanh(grain * 8)
    body = butter(nz, "bandpass", [1800, 7500], 2) * grain
    air = butter(nz, "highpass", 8000, 2) * 0.35
    # stroke speed: swell in, steady, lift off
    speed = np.sin(np.pi * np.clip(t / total, 0, 1)) ** 0.6
    squeak = np.sin(2 * np.pi * (1350 + 200 * t / total) * t) * 0.05 * speed
    y = (body + air) * speed * 0.35 + squeak
    y = filt(y, "peak", 3200, 1.0, 3.0)
    y *= attack_ramp(n, 0.012) * release_tail(n, total - 0.04, 0.04)
    # move left-to-right across the stroke, like a pen crossing a word
    p = np.linspace(-0.35, 0.35, n)
    th = (p + 1) * np.pi / 4
    st = np.stack([y * np.cos(th), y * np.sin(th)], 1)
    return fade_edges(st, 0.0005, 0.005)
