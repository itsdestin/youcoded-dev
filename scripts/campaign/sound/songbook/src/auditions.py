"""THE OWNER'S LISTENING SESSION (round 9, 2026-11-25): short A/B clips for every [OWNER] decision
in toolkit-plan.md ("Open questions", every [OWNER] tag) and what-we-learned.md ("What remains
your call"). Each decision gets 2-4 clips, 18 s each, IDENTICAL except for the one thing being
decided, so he compares like with like.

    felt-and-pulse/.venv/bin/python -I src/auditions.py [decision ...]   # default: every decision

Writes  ~/Documents/youcoded-campaign/round9/auditions/<decision>/<option>.mp3  and  index.json
(question, why it matters, options, the toolkit's current default, and what was measured).

How a clip is made:
  * Music-only decisions use recipe B's worked example (demos.RECIPE_B: app demo, 116 bpm) and keep
    its first 18 s: the pad and the pulse, the tune twice, the first cycle coming in.
  * Narrator decisions use recipe C's worked example (demos.RECIPE_C) with the same stretch of
    voice-take1-lily.wav (0-16.5 s of her file, starting 1.5 s into the clip), mixed the way the
    film's mux does it (music 10 dB under its mastered level), first 18 s.
  * Every option is BUILT by the recipe with the switch given (owner_over / sound), never patched
    on a finished piece, except where noted (the narrator note-count clip, which changes only the
    sections under her words).
  * Each clip is brought to the same loudness (-16 LUFS) so "louder" never passes for "better",
    and checked: not silent, not clipped, and measurably different from the default in the way
    intended. Those numbers go into index.json under "measured". Nobody here has heard them.

Nothing here changes the toolkit; it only renders what the toolkit's switches already do, plus one
audition-only treatment the toolkit does not build: the narrator "follow" dip (the owner's rule
forbids it in films until he has heard this A/B; recipes.owner() still refuses it).
"""
import copy
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "engine"))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import build  # noqa: E402
import demos  # noqa: E402
import mix as X  # noqa: E402
import options as O  # noqa: E402
import recipes as R  # noqa: E402
from cycles import Cycle  # noqa: E402
from dsp import SR, biquad, butter, undb  # noqa: E402
from master import lufs, measure  # noqa: E402

DEST = os.path.expanduser("~/Documents/youcoded-campaign/round9/auditions")
CLIP = 18.0                 # seconds kept from the start of each piece
CLIP_LUFS = -16.0           # every clip brought to this loudness (like with like)
VOICE = demos._VOICE        # the same narrator take as recipe C's worked example
VOICE_START = 1.5           # her first word 1.5 s into the clip (recipe C's pre-roll)
MUSIC_DB = -10.0            # the film mux's gain on the music under her (RECIPE_C.voice_mux)


# ------------------------------------------------------------------ the two base pieces

def demo_piece(owner_over=None, sound=None):
    """Recipe B's worked example, rebuilt with one switch. WHY rebuilt instead of copied: the
    owner switches (sustain, pulse, chords, pad level) shape the piece while the recipe builds it;
    flipping them afterwards leaves half the piece made with the old value (SONGBOOK pitfall).
    The arguments mirror demos.RECIPE_B exactly (explain text left out: it does not sound)."""
    return R.app_demo(
        "audition-demo", 36.0, land=demos._B_LAND, bpm=demos._B_BPM, seed=23, brief=demos._B_BRIEF,
        chords="Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abmaj9 Bb9sus Bb9sus Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abmaj9 Ab/Bb",
        tune=[(4, "cell"), (9, "cell"), (13, "from-top")],
        cycles=[Cycle("Bb5/0.5 G5/1", period=23, offset=13, name="cycle1"),
                Cycle("F5/1 D5/1", period=29, offset=22, name="cycle2", touch=0.26)],
        changes=[(5, "in", "cycle1"), (9, "in", "sub"), (13, "in", "held"), (13, "in", "cycle2"), (13, "peak")],
        owner_over=owner_over, sound=sound,
    # WHY v3: made before the unity rebuild (2026-11-25); it renders as it was heard
    style="v3")


def narr_piece(owner_over=None, sound=None):
    """Recipe C's worked example, rebuilt with one switch (mirrors demos.RECIPE_C)."""
    return R.narrated(
        "audition-narr", 36.0, land=demos._C_LAND, speech=demos._C_SPEECH, turn=22.9, seed=25, whimsy=True,
        brief=R.Brief("narrated", 36.0, ("storybook", "patient", "warm"), "subtle",
                      moments=[(22.9, "the turn"), (26.5, "peak")], logo_at=demos._C_LAND),
        voice_mux=dict(path=VOICE, t_from=0.0, start_at=VOICE_START, music_db=MUSIC_DB),
        owner_over=owner_over, sound=sound,
    # WHY v3: made before the unity rebuild (2026-11-25); it renders as it was heard
    style="v3")


# Pulse masks for the narrator note-count decision (16 steps; "x" = a note). At 120 bpm an eighth
# step is 0.25 s and a sixteenth 0.125 s.
MASK_TODAY = "x.x.x.x.x.x.xx.x"     # recipe C's own: 9 of 16 eighths = about 2.2 notes a second
MASK_3 = "x.xxx.xxx.xxx.xx"         # 12 of 16 eighths = about 3 a second
MASK_5 = "x.xx.xx.x.xx.xx."         # 10 of 16 sixteenths = about 5 a second (round 8's busy end)


def busier_under_words(piece, mask, step):
    """The pulse under her words only, made denser; everything else (pitches, register, touch,
    chords, the music after her words) stays. WHY on the sections, after the build: the recipe's
    `mask` argument would change the pulse after her words too, which is not the question; the
    pulse's fields are read when the sections are played (studio.apply_switch does the same), so
    this is not the build-time pitfall."""
    q = copy.deepcopy(piece)
    for s in q.sections:
        if getattr(s, "narration", False):
            s.fig_mask, s.step = mask, step
    return q


# ------------------------------------------------------------------ the decisions

# Each option: name (file), label, what (plain words), build (-> piece), and optional
# "treat" (how the music is treated under her: "static" (the toolkit's), "follow", "none").
DECISIONS = [
    dict(key="held-layer", base="demo", default="pad",
         question="What should the soft, steady sound underneath everything be?",
         why="It sits under every second of every film, so it sets the whole mood more than any tune.",
         options=[
             dict(name="pad", label="Soft synth", build=lambda: demo_piece({"sustain": "pad"}),
                  what="A soft, warm synthesizer chord that fades in and out slowly underneath."),
             dict(name="held-strings", label="Held strings", build=lambda: demo_piece({"sustain": "held"}),
                  what="Quiet string instruments holding long notes underneath, at the same level."),
             dict(name="ringing-piano", label="Ringing piano", build=lambda: demo_piece({"sustain": "ring"}),
                  what="Soft piano chords left to ring out underneath, at the same level."),
         ]),
    dict(key="synth-tone", base="demo", default="buzzy",
         question="If the soft synth is the background sound, which tone of it?",
         why="The synth is the default background; its tone decides whether it feels warm-and-full or round-and-faint.",
         options=[
             dict(name="buzzy", label="Fuller", build=lambda: demo_piece(sound={"pad_timbre": "saw"}),
                  what="The synth background with a slightly fuller, richer tone."),
             dict(name="round", label="Rounder", build=lambda: demo_piece(sound={"pad_timbre": "triangle"}),
                  what="The same synth background with a rounder, softer, plainer tone."),
         ]),
    dict(key="background-level", base="demo", default="quiet",
         question="How loud should the steady background be next to the soft repeating piano?",
         why="Too quiet and the gaps between piano notes can feel choppy; too loud and the music feels thick.",
         options=[
             dict(name="quiet", label="Quiet background", build=lambda: demo_piece({"pad_level": -8}),
                  what="The background well under the piano: you mostly hear the piano notes."),
             dict(name="medium", label="Medium background", build=lambda: demo_piece({"pad_level": -4}),
                  what="The background a bit louder, filling more of the gaps between piano notes."),
             dict(name="even", label="Even background", build=lambda: demo_piece({"pad_level": 0}),
                  what="The background about as present as the piano notes."),
         ]),
    dict(key="repeating-piano", base="demo", default="circling",
         question="Which soft repeating piano pattern should run underneath?",
         why="The pattern plays the whole way through, so it decides whether the music feels calm or busy.",
         options=[
             dict(name="circling", label="Circling one note", build=lambda: demo_piece({"pulse": "pedal", "fig_order": "circle"}),
                  what="The pattern keeps coming back to one note and stays the same when the chords change."),
             dict(name="tune-loop", label="Our tune's notes in order", build=lambda: demo_piece({"pulse": "pedal", "fig_order": "cell"}),
                  what="The same few notes, played in the order of our three-note tune, looping."),
             dict(name="follows-chords", label="Follows the chords (round 8)", build=lambda: demo_piece({"pulse": "chord"}),
                  what="Last round's pattern: it picks new notes every time the chord changes."),
         ]),
    dict(key="chord-colour", base="demo", default="rich",
         question="Should the chords be richer and dreamier, or plainer and simpler?",
         why="Richer chords are what give calm game music its soft, dreamy colour; plain ones are clearer but flatter.",
         options=[
             dict(name="rich", label="Richer chords", build=lambda: demo_piece({"chords": "rich"}),
                  what="Each chord has an extra soft note or two added, for a dreamier colour."),
             dict(name="plain", label="Plain chords", build=lambda: demo_piece({"chords": "plain"}),
                  what="The same chords in their plain, simple form."),
         ]),
    dict(key="piano-sound", base="demo", default="upright",
         question="Which piano recording should play our music?",
         why="The piano carries the tune and the pattern in every film, so its sound is the brand's voice.",
         options=[
             dict(name="upright", label="Upright piano (today)", build=lambda: demo_piece(sound={"piano": "upright-kw"}),
                  what="Today's soft upright piano."),
             dict(name="upright-2", label="A second upright", build=lambda: demo_piece(sound={"piano": "vcsl-upright"}),
                  what="A different upright piano recording, played the same way."),
             dict(name="grand", label="Grand piano", build=lambda: demo_piece(sound={"piano": "salamander"}),
                  what="A grand piano recording, softened the same way (it needs a credit line if chosen)."),
         ]),
    dict(key="brightness", base="demo", default="dark",
         note="Measured: the treble boost alone barely changes this clip (the soft piano has almost nothing that high); "
              "the whole old finish is the clearly different one.",
         question="Should the overall sound be softer and darker, or crisper and brighter like before?",
         why="Our old music had a strong treble boost, the most likely cause of 'harsh'.",
         options=[
             dict(name="dark", label="Softer, darker (today)", build=lambda: demo_piece(),
                  what="No extra treble: soft and warm, close to the piano logo you chose."),
             dict(name="bright", label="Crisper (the old setting)",
                  build=lambda: demo_piece(sound={"air_db": 11.0, "air_policy": "as-written"}),
                  what="The same music with the old strong treble boost on top."),
             # WHY a third option: the 18 s clip has almost nothing above 8 kHz (the felt piano's
             # bus is low-passed), so the treble boost alone changes little; round 7's brightness
             # came from the whole old finish (hard piano layers, no piano EQ, a brighter hall,
             # the boost). This is the sound profile the v1 pieces still pin (options.PROFILES).
             dict(name="old-finish", label="The whole old finish",
                  build=lambda: demo_piece(sound=dict(O.PROFILES["v1"])),
                  what="The same notes with every old sound setting: the treble boost, a brighter echo, "
                       "the piano without today's softening."),
         ]),
    dict(key="narrator-speed", base="narr", default="steady",
         note="Her speed in this stretch was counted at about 4.9 syllables a second, so her own stress rate came out "
              "at 148 beats a minute, not the 138 in the research notes.",
         question="Under the narrator, how fast should the music's beat be?",
         why="She speaks quickly; the music's beat can sit at a relaxed pace or move closer to her speed.",
         options=[
             dict(name="steady", label="Relaxed beat (120 a minute)", build=lambda: narr_piece({"narrator_tempo": "near120"}),
                  what="The music moves at a relaxed, walking pace under her."),
             dict(name="faster", label="Faster beat (about 148 a minute)", build=lambda: narr_piece({"narrator_tempo": "stress"}),
                  what="The music moves faster, at the rhythm of her stressed syllables (round 8's rule)."),
         ]),
    dict(key="narrator-notes", base="narr", default="few",
         question="Under the narrator, how many soft piano notes should play?",
         why="Fewer notes leave room for her words; more notes keep the music moving but can compete with her.",
         options=[
             dict(name="few", label="About 2 a second (today)", build=lambda: busier_under_words(narr_piece(), MASK_TODAY, 0.5),
                  what="A few soft, high piano notes under her words."),
             dict(name="some", label="About 3 a second", build=lambda: busier_under_words(narr_piece(), MASK_3, 0.5),
                  what="The same notes, a little more often under her words."),
             dict(name="many", label="About 5 a second", build=lambda: busier_under_words(narr_piece(), MASK_5, 0.25),
                  what="The same notes, about twice as often, close to how busy last round was."),
         ]),
    dict(key="narrator-room", base="narr", default="fixed",
         note="Measured: 'Fixed' and 'No change' are nearly identical with this soft, dark music, which has very little "
              "in her voice's range; her pauses in this take are short (0.4 s at most), so 'Dips with her words' is "
              "down most of the time and lifts only briefly.",
         question="How should the music make room for her voice?",
         why="You ruled out the music bouncing with every word; a gentle version of that is the alternative to a fixed change.",
         options=[
             dict(name="fixed", label="Fixed (today)", build=lambda: narr_piece(), treat="static",
                  what="While she talks, the music has a fixed, slightly softer tone where her voice sits. It never moves with her words."),
             dict(name="follows", label="Dips with her words", build=lambda: narr_piece(), treat="follow",
                  what="The music gets a little quieter and softer while she is speaking and comes back up in her pauses."),
             dict(name="nothing", label="No change", build=lambda: narr_piece(), treat="none",
                  what="The music is left as it is under her (only its overall level is lower, as in every option)."),
         ]),
]


# ------------------------------------------------------------------ rendering

def _premaster_untreated(raw, plans, piece):
    """mix.premaster_music without the static speech-band cut under narration (for the "none" and
    "follow" treatments). WHY a copy here: the toolkit has no "off" for the cut (voice_cut is
    "mid" or the old "stereo-dip"), and this is an audition, not a toolkit option."""
    x = X.premaster(raw, air_db=X.air_for(piece), glue=O.get("glue", piece))
    tone = float(getattr(piece, "tone", 0.0) or 0.0)
    if tone:
        x = biquad(x, "highshelf", 3500, 0.6, tone)
    gain_db, _ = X.level_plan(plans, len(x))
    return x * undb(gain_db)[:, None]


def _voice(n):
    """Her voice placed as in the film's mux: her file from 0 s, starting VOICE_START s in."""
    v, sr = sf.read(VOICE, dtype="float64", always_2d=True)
    if sr != SR:
        from math import gcd
        from scipy import signal
        g = gcd(SR, sr)
        v = signal.resample_poly(v, SR // g, sr // g, axis=0)
    v = v[:, :2] if v.shape[1] >= 2 else np.repeat(v, 2, axis=1)
    out = np.zeros((n, 2))
    off = int(VOICE_START * SR)
    k = min(n - off, len(v))
    out[off:off + k] = v[:k]
    return out


def _speaking(voice):
    """0..1, how much she is speaking at each sample: her level in 20 ms windows over a threshold,
    smoothed to 50 ms in / 150 ms out. WHY so quick: her longest pauses in this take are 0.4 s
    (measured over the whole words file), so a slower release never let the music back up and
    "follow" became a constant dip, the same as "fixed"."""
    m = np.abs(voice.mean(axis=1))
    w = int(0.02 * SR)
    nwin = len(m) // w
    rms = np.sqrt((m[:nwin * w].reshape(nwin, w) ** 2).mean(axis=1) + 1e-20)
    ref = np.percentile(rms[rms > 1e-6], 95) if np.any(rms > 1e-6) else 1.0
    on = (20 * np.log10(rms / ref) > -30).astype(float)
    env = np.zeros_like(on)
    a_in, a_out = 1 - np.exp(-0.02 / 0.05), 1 - np.exp(-0.02 / 0.15)
    for i in range(len(on)):
        prev = env[i - 1] if i else 0.0
        env[i] = prev + (a_in if on[i] > prev else a_out) * (on[i] - prev)
    full = np.repeat(env, w)
    return np.pad(full, (0, max(0, len(m) - len(full))), mode="edge")[:len(m)]


def _follow(x, voice):
    """The "follow" treatment: the music dips 3 dB, and its mid takes the same 2.5 dB cut at
    3.2 kHz the static treatment uses, but only while she is speaking (_speaking), so it moves with
    her phrases. WHY these depths: the same tone change as the fixed option plus a small level dip,
    so the A/B is "fixed" against "moving", not "less" against "more"."""
    s = _speaking(voice)[:len(x)]
    mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    mc = biquad(mid, "peak", 3200, 0.8, -2.5)
    mid = mid * (1 - s) + mc * s
    y = np.stack([mid + side, mid - side], axis=1)
    return y * undb(-3.0 * s)[:, None]


def render_clip(opt, base):
    """(clip audio at CLIP_LUFS, band, plans, piece, the music alone before the voice)."""
    piece = opt["build"]()
    raw, band, plans, _ = build.render(piece)
    treat = opt.get("treat", "static")
    if base == "narr" and treat != "static":
        xm = _premaster_untreated(raw, plans, piece)
        if treat == "follow":
            xm = _follow(xm, _voice(len(xm)))
    else:
        xm = X.premaster_music(raw, plans, piece)
    y = X.finish_piece(xm, piece)          # the whole piece mastered to its own loudness
    n = int(CLIP * SR)
    music = y[:n].copy()
    mixd = music * undb(MUSIC_DB) + _voice(n) if base == "narr" else music.copy()
    # a 0.6 s fade at the cut so the clip does not stop on a click
    w = int(0.6 * SR)
    mixd[-w:] *= (np.cos(np.linspace(0, np.pi / 2, w)) ** 2)[:, None]
    mixd = mixd * undb(CLIP_LUFS - lufs(mixd))
    return mixd, band, plans, piece, music


# ------------------------------------------------------------------ measuring

def _bands(x, lo, hi):
    return butter(butter(x.mean(axis=1), "highpass", lo, 4), "lowpass", hi, 4)


def _centroid(x):
    """Spectral centroid, Hz: where the middle of a sound's brightness sits."""
    from scipy import signal
    m = x.mean(axis=1) if x.ndim == 2 else x
    f, p = signal.welch(m, SR, nperseg=8192)
    return round(float((f * p).sum() / (p.sum() + 1e-30)))


def _tone(x):
    """The toolkit's own darkness instrument (master.tone_report) on a clip."""
    from master import tone_report
    t = tone_report(x)
    return {"tilt dB/oct": t["tilt_db_per_oct"], "2-5 kHz share dB": t["presence_2_5k"], "5-16 kHz share dB": t["air_5_16k"]}


def _spans():
    """Her words as (start, end) spans in clip seconds, and her pauses between them inside the clip."""
    sp = [(a, b) for a, b in demos._C_SPEECH if a < CLIP]
    gaps = [(b, a2) for (_, b), (a2, _) in zip(sp, sp[1:]) if a2 - b >= 0.2]
    return sp, gaps


def _mask(spans, n, pad=0.0):
    m = np.zeros(n, bool)
    for a, b in spans:
        m[int(max(0, a + pad) * SR):int(min(CLIP, b - pad) * SR)] = True
    return m


def _db(v):
    return float(10 * np.log10(np.mean(v ** 2) + 1e-20))


def _stem_lufs(band, name):
    s = band.stems.get(name)
    if s is None:
        return None
    s = s[:int(CLIP * SR)]
    return round(lufs(s), 1) if np.abs(s).max() > 1e-9 else None


def _pulse_notes(band, t0=0.0, t1=CLIP):
    """The repeating piano pattern's notes. WHY not only role "pulse": round 8's chord-following
    figure logs its notes on the piano bus with no role, so both kinds are counted."""
    other = {"bass", "lead", "double", "sustain", "cycle", "counter", "answer"}
    return [e for e in band.log if e["bus"] == "piano" and e.get("role") not in other and t0 <= e["t"] < t1]


def _words_span():
    w = [x for x in demos._C_SPEECH.words if x[2] <= CLIP]
    return (w[0][1], w[-1][2]) if w else (0.0, CLIP)


def specific(key, opt, band, plans, piece, music, clip):
    """The number that shows THIS decision's difference (plain words)."""
    from form import nm as _nm
    if key == "held-layer":
        bus = {"pad": "pad", "held-strings": "bowed", "ringing-piano": "ring"}[opt["name"]]
        return {"background bus": bus, "background loudness LUFS": _stem_lufs(band, bus),
                "pad LUFS": _stem_lufs(band, "pad"), "strings LUFS": _stem_lufs(band, "bowed"),
                "ring LUFS": _stem_lufs(band, "ring")}
    if key == "synth-tone":
        p = band.stems["pad"][:int(CLIP * SR)]
        return {"synth layer's brightness centre, Hz": _centroid(p),
                "synth share above 1 kHz, dB": round(_db(_bands(p, 1000, 16000)) - _db(p.mean(axis=1)), 1)}
    if key == "background-level":
        return {"background minus piano, LU": round((_stem_lufs(band, "pad") or -99) - (_stem_lufs(band, "piano") or -99), 1),
                "pad LUFS": _stem_lufs(band, "pad"), "piano LUFS": _stem_lufs(band, "piano")}
    if key == "repeating-piano":
        ps = _pulse_notes(band)
        seq = [_nm(e["m"]) for e in ps]
        return {"pattern notes": len(ps), "different pitches": len(set(seq)), "first 12": " ".join(seq[:12])}
    if key == "chord-colour":
        v = [(c, len(ms)) for b, c, ms in band.bed_info["voicing"] if b * 60 / demos._B_BPM < CLIP]
        return {"chords (name, notes held)": v}
    if key == "piano-sound":
        p = band.stems["piano"][:int(CLIP * SR)]
        return {"piano's brightness centre, Hz": _centroid(p), **_tone(clip)}
    if key == "brightness":
        return {"brightness centre, Hz": _centroid(clip), **_tone(clip)}
    if key == "narrator-speed":
        return {"beats a minute": round(float(np.median([p.bpm for p in plans[:-1]])), 1)}
    if key == "narrator-notes":
        a, z = _words_span()
        ps = _pulse_notes(band, a, z)
        return {"pulse notes a second under her words": round(len(ps) / (z - a), 2),
                "pitches": sorted({_nm(e["m"]) for e in ps})}
    if key == "narrator-room":
        # the music alone (before her voice is added): its level and its 2.5-4 kHz band inside her
        # words against inside her pauses (each trimmed 0.1 s from its edges). The fixed option
        # should show no difference beyond the music's own; "follow" about 3 dB.
        sp, gaps = _spans()
        on, off = _mask(sp, len(music), 0.1), _mask(gaps, len(music), 0.1)
        lvl, sb = music.mean(axis=1), _bands(music, 2500, 4000)
        return {"music level, in her words minus in her pauses, dB": round(_db(lvl[on]) - _db(lvl[off]), 1),
                "music's 2.5-4 kHz band, in her words minus in her pauses, dB": round(_db(sb[on]) - _db(sb[off]), 1),
                "seconds of pause measured": round(off.sum() / SR, 2),
                # the follow dip as applied (0 for the other options): in her words, and at the
                # middle of each pause between them
                **({"follow dip in her words, median dB": round(float(np.median(-3.0 * _speaking(_voice(len(music)))[on])), 1),
                    "follow dip at the middle of her pauses, dB": [round(float(-3.0 * _speaking(_voice(len(music)))[int((a + b) / 2 * SR)]), 1)
                                                                   for a, b in gaps]}
                   if opt.get("treat") == "follow" else {})}
    return {}


def checks(clip, mp3_path):
    """Not silent, not clipped, measured on the WAV and again on the decoded MP3."""
    st = measure(clip, "clip")
    win = int(0.5 * SR)
    lv = [20 * np.log10(np.sqrt((clip[k:k + win] ** 2).mean()) + 1e-12) for k in range(0, len(clip) - win, win)]
    dec = subprocess.run(["ffmpeg", "-v", "error", "-i", mp3_path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    y = np.frombuffer(dec, dtype=np.float32).reshape(-1, 2).astype(np.float64)
    return {"lufs": st["lufs_integrated"], "true_peak_dbtp": st["true_peak_dbtp"],
            "quietest_half_second_dbfs": round(float(min(lv[1:-2])), 1),
            "mp3_sample_peak_dbfs": round(float(20 * np.log10(np.abs(y).max() + 1e-12)), 2),
            "mp3_clipped_samples": int((np.abs(y) >= 0.999).sum()),
            "ok": bool(st["true_peak_dbtp"] <= -1.0 and min(lv[1:-2]) > -50.0 and (np.abs(y) >= 0.999).sum() == 0)}


# ------------------------------------------------------------------ main

def main(want):
    os.makedirs(DEST, exist_ok=True)
    idx_path = os.path.join(DEST, "index.json")
    old = {}
    if os.path.exists(idx_path):
        old = {d["key"]: d for d in json.load(open(idx_path))}
    out = []
    for d in DECISIONS:
        if want and d["key"] not in want:
            if d["key"] in old:
                out.append(old[d["key"]])
            continue
        ddir = os.path.join(DEST, d["key"])
        os.makedirs(ddir, exist_ok=True)
        ref = None
        opts = []
        made = [(opt,) + render_clip(opt, d["base"]) for opt in d["options"]]
        # WHY one level for the whole decision: a clip that would peak over -1.2 dBFS at CLIP_LUFS
        # is brought down (never limited, so none is squashed differently from its neighbours), and
        # then every clip of the decision is brought to that same, lowest loudness: like with like
        trim = min([0.0] + [20 * np.log10(10 ** (-1.2 / 20) / np.abs(c[1]).max()) for c in made])
        for opt, clip, band, plans, piece, music in made:
            clip = clip * undb(trim)
            wav = os.path.join(ddir, f".{opt['name']}.wav")
            sf.write(wav, clip, SR, subtype="PCM_24")
            mp3 = os.path.join(ddir, f"{opt['name']}.mp3")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "192k", mp3],
                           check=True)
            os.remove(wav)
            m = checks(clip, mp3)
            if ref is None:
                ref = clip
                m["differs from the first option, dB"] = None
            else:
                # the null test: how loud what differs is, against the first option
                k = min(len(ref), len(clip))
                m["differs from the first option, dB"] = round(_db((clip[:k] - ref[:k]).mean(axis=1)) - _db(ref[:k].mean(axis=1)), 1)
            m.update(specific(d["key"], opt, band, plans, piece, music, clip))
            print(f"{d['key']}/{opt['name']}: {json.dumps(m)}", flush=True)
            opts.append(dict(file=os.path.relpath(mp3, DEST), label=opt["label"], what_is_different=opt["what"],
                             measured=m))
        out.append(dict(key=d["key"], question=d["question"], why_it_matters=d["why"], options=opts,
                        # the option the toolkit uses now, as its file
                        default=f"{d['key']}/{d['default']}.mp3",
                        clip=("recipe B worked example (app demo), first 18 s" if d["base"] == "demo" else
                              "recipe C worked example with the narrator (voice-take1-lily, 0-16.5 s of her file), first 18 s"),
                        loudness="every clip of a decision at the same loudness (-16 LUFS, or lower when one clip "
                                 "would otherwise peak too high)",
                        **({"note": d["note"]} if d.get("note") else {})))
    order = [d["key"] for d in DECISIONS]
    out.sort(key=lambda d: order.index(d["key"]) if d["key"] in order else 99)
    with open(idx_path, "w") as f:
        json.dump(out, f, indent=1)
    print(idx_path)


if __name__ == "__main__":
    main(sys.argv[1:])
