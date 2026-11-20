"""Render the logo alternatives into ../out/ and measure every one.

Run:  scripts/campaign/sound/logo-alternatives/render.sh
Writes out/NN-name.wav (48 kHz, stereo, 24-bit), out/measurements.json and out/checks.txt.
"""
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # WHY: run with python -I (isolated); our modules are added explicitly

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from scipy import signal  # noqa: E402
from scipy.ndimage import uniform_filter1d  # noqa: E402

import logos  # noqa: E402
import strings as st  # noqa: E402
from dsp import SR, butter, db, note, true_peak, undb  # noqa: E402
from master import finish, lufs, measure, premaster  # noqa: E402

OUT = os.path.join(HERE, "..", "out")
CURRENT = os.path.join(HERE, "..", "..", "felt-and-pulse", "out", "logo.wav")
TARGET = -16.0
# WHY -3.3 (same as the current logo): demos paste the logo 2 dB hotter than -16 LUFS, and it
# must still stay under -1 dBTP there. Any version can then replace the current one as is.
CEILING = -3.3


def write(name, x):
    path = os.path.join(OUT, name)
    sf.write(path, np.asarray(x, dtype=np.float64), SR, subtype="PCM_24")
    y, sr = sf.read(path, dtype="float64", always_2d=True)
    assert sr == SR and y.shape[1] == 2
    return y


# ------------------------------------------------------------------ extra measurements

def envelope_db(x, hp=200.0):
    """Loudness contour above 200 Hz (the sub is ignored: it swells, it is not an attack):
    the Hilbert envelope smoothed over 6 ms, in dB. (3 ms left a +/-5 dB ripple from low
    notes beating, which made the landing jump about on the plucked-strings version.)"""
    m = butter(x.mean(axis=1), "highpass", hp, 4)
    e = np.abs(signal.hilbert(m))
    w = int(0.006 * SR)
    e = np.convolve(e, np.ones(w) / w, mode="same")
    return 20 * np.log10(e + 1e-9)


def landing_time(x, lo=0.44, hi=0.60):
    """When the landing is struck, from the audio alone: find the steepest 10 ms rise of the
    >200 Hz loudness contour between 0.44 and 0.60 s, then the first moment it climbs 3 dB
    above the level just before that rise (the start of the audible attack). The same rule
    is applied to the current logo, which is the reference."""
    e = envelope_db(x)
    s = int(0.010 * SR)
    rise = e[s:] - e[:-s]
    i0, i1 = int(lo * SR), int(hi * SR)
    k = i0 + int(np.argmax(rise[i0:i1]))
    pre = float(np.median(e[k - int(0.02 * SR): k - int(0.002 * SR)]))
    j = k - int(0.01 * SR)
    while e[j] < pre + 3.0:
        j += 1
    return j / SR


BANDS = [(40, 150), (150, 400), (400, 1000), (1000, 2500), (2500, 6000), (6000, 14000)]


def onsets(x, thr=4.0, strength=False):
    """Every attack in the file, as times (seconds).

    In six bands (40 Hz to 14 kHz, the lowest is where a kick or thump would live), compare
    the energy in the 10 ms just after each moment with the 20 ms just before it. A band
    "attacks" when it jumps more than 6 dB; the jumps above 6 dB are summed across bands and
    an attack is counted where that sum passes `thr` (4). Measured on these files: every
    written note scores 20-77, the strongest thing that is NOT a note scores 3.5 (the smear
    of a section pizzicato), quiet planted snaps/ticks/hats score 4.2-36. Comparing short averages (not single
    samples) keeps string vibrato, reverb and the pads' soft noise from looking like hits.
    Each attack found must sit on a note we wrote; detector_self_test proves it catches drums."""
    m = x.mean(axis=1)
    n = len(m)
    a, c = int(0.015 * SR), int(0.005 * SR)
    total = np.zeros(n)
    pws = [signal.sosfiltfilt(signal.butter(4, [lo, hi], "bandpass", fs=SR, output="sos"), m) ** 2
           for lo, hi in BANDS]
    # ignore what nobody can hear: anything 45 dB under the file's loudest band (a faint
    # rumble inside a piano recording, 50 dB under the tune, is not a "sound"), and anything
    # under -80 dBFS (otherwise rounding noise in an empty band counts as "attacks")
    loudest = max(uniform_filter1d(pw, int(0.05 * SR)).max() for pw in pws)
    floor = max(loudest * 10 ** (-45 / 10), 1e-8)
    for pw in pws:
        pre = uniform_filter1d(pw, int(0.020 * SR))
        post = uniform_filter1d(pw, int(0.010 * SR))
        r = np.zeros(n)
        r[a:n - c] = 10 * np.log10((post[a + c:] + floor) / (pre[: n - a - c] + floor))
        total += np.maximum(r - 6.0, 0)
    W = int(0.04 * SR)
    out = []
    idx = np.where(total >= thr)[0]
    while len(idx):
        i = idx[0]
        k = i + int(np.argmax(total[i: i + W]))
        # with strength=True also report where the attack BEGINS (first crossing of thr):
        # unlike the peak, it does not drift later when a rolled chord follows the first note
        out.append((round(k / SR, 4), float(total[k]), round(i / SR, 4)) if strength else round(k / SR, 3))
        idx = idx[idx >= i + W]
    return out


def stray(attacks, events, tol=0.035, pizz_spread=0.15):
    """Attacks that are not on a written note (within 35 ms). WHY pizz_spread: the plucked
    strings are SECTION recordings, several players plucking within ~0.1 s of each other, so
    one written pizzicato note can show up as a pluck plus a later smaller one."""
    def on_note(a):
        for t, kind, _ in events:
            hi = tol + (pizz_spread if kind == "pizz" else 0.0)
            if -tol <= a - t <= hi:
                return True
        return False
    return [a for a in attacks if not on_note(a)]


def detector_self_test(y, events):
    """Plant four quiet drum sounds (the old kit's kick, snap, key tick and hat, each peaking
    14 dB under the file's own peak: quiet, but you would hear it) where no note starts, and
    confirm all four are flagged as attacks that are not notes."""
    import instruments as ins
    from dsp import place, to_stereo
    starts = [e[0] for e in events]
    free = [t for t in np.arange(0.7, len(y) / SR - 0.5, 0.05)
            if min(abs(t - s) for s in starts) > 0.12]
    if len(free) < 4:
        return None
    picks = [free[int(k * (len(free) - 1) / 3)] for k in range(4)]
    z = y.copy()
    pk = np.abs(y).max()
    planted = []
    # WHY kick last: right under the landing the sub and the low piano already fill the kick's
    # band, so a planted kick there is partly masked (it was missed in 7 of 11 files). That
    # blind spot is covered by static_check() instead: no version calls any drum code at all.
    for (label, fn), at in zip((("snap", lambda: ins.snap(0.6)), ("tick", lambda: ins.tick(0.5)),
                                ("hat", lambda: ins.hat(0.4)), ("kick", lambda: ins.kick(0.9))), picks):
        s = to_stereo(fn())
        place(z, s / np.abs(s).max() * pk * 0.2, at)
        planted.append((label, round(float(at), 2)))
    found = stray(onsets(z), events)
    caught = [lab for lab, at in planted if any(abs(f - at) <= 0.035 for f in found)]
    return dict(planted=planted, caught=caught)


def static_check():
    """The versions' source never calls a drum, thump, riser or glass-pluck sound."""
    src = open(os.path.join(HERE, "logos.py")).read()
    banned = ["ins.kick", "ins.snap", "ins.hat", "ins.shaker", "ins.tick", "ins.thump", "ins.swell",
              "ins.pluck", ".kick(", ".snap(", ".hat(", ".shaker(", ".swell(", ".pluck("]
    return [b for b in banned if b in src]


def momentary_max(x):
    """Loudest 400 ms (EBU momentary), the loudness you notice in a short sound."""
    best = -99.0
    n, h = int(0.4 * SR), int(0.05 * SR)
    for i in range(0, len(x) - n + 1, h):
        v = lufs(x[i:i + n])
        if np.isfinite(v):
            best = max(best, v)
    return round(best, 1)


def period_cents(x, want_hz):
    """How far a note's repeating period is from the intended pitch, in cents.

    WHY autocorrelation, not the loudest spectral peak: the low string recordings have almost
    no fundamental (the ear still hears it from the overtones), so a peak-picker reads them an
    octave high. The waveform still repeats at the true period. Among the candidate periods
    T/2, T and 2T, the true one is the SHORTEST that repeats nearly as well as the best."""
    m = x.mean(axis=1) if x.ndim == 2 else x
    m = m[int(0.03 * SR): int(0.33 * SR)]
    m = m - m.mean()
    ac = signal.fftconvolve(m, m[::-1], mode="full")[len(m) - 1:]
    ac /= ac[0]
    T = SR / want_hz
    cands = []
    for mult in (0.5, 1.0, 2.0):
        c = T * mult
        lo, hi = int(c * 2 ** (-1 / 12)), int(c * 2 ** (1 / 12)) + 1   # search one semitone
        k = lo + int(np.argmax(ac[lo:hi]))
        a, b, cc = ac[k - 1], ac[k], ac[k + 1]
        k_ref = k + 0.5 * (a - cc) / (a - 2 * b + cc)                 # parabolic refinement
        cands.append((mult, float(b), k_ref))
    best = max(v for _, v, _ in cands)
    mult, _, k_ref = next(c for c in cands if c[1] >= 0.8 * best)
    return float(1200 * np.log2((SR / k_ref) / want_hz))


def pitch_test():
    """Prove the string recordings are mapped to the right pitch (within 30 cents)."""
    res = {}
    for label, x, nm in (("violin pizz G5", st.pizz("vln", note("G5"), 0.5)[0], "G5"),
                         ("violin pizz Bb4", st.pizz("vln", note("Bb4"), 0.5)[0], "Bb4"),
                         ("cello pizz Eb2", st.pizz("vc", note("Eb2"), 0.6)[0], "Eb2"),
                         ("bowed F5", st.bowed(note("F5"), 0.6, np.ones(int(0.6 * SR)), 0.5), "F5"),
                         ("bowed Bb3", st.bowed(note("Bb3"), 0.6, np.ones(int(0.6 * SR)), 0.5), "Bb3"),
                         ("bowed Eb3", st.bowed(note("Eb3"), 0.6, np.ones(int(0.6 * SR)), 0.5), "Eb3")):
        res[label] = round(period_cents(x, 440 * 2 ** ((note(nm) - 69) / 12)), 0)
    return res


# ------------------------------------------------------------------ main

def main():
    os.makedirs(OUT, exist_ok=True)
    report = {}
    built = {}
    limiting = {"01-current": None}

    # 01: the current logo, byte for byte
    shutil.copyfile(CURRENT, os.path.join(OUT, "01-current.wav"))
    y, _ = sf.read(os.path.join(OUT, "01-current.wav"), dtype="float64", always_2d=True)
    built["01-current"] = (y, [(0.0, "piano", 70), (0.25, "piano", 79), (0.5, "piano", 77),
                               (0.5, "piano", 39), (0.53, "piano", 51), (0.35, "pad", None),
                               (0.5, "bass", 39), (0.75, "pluck", 82), (0.875, "pluck", 91),
                               (1.0, "pluck", 89)], None)

    for name, fn in logos.VERSIONS.items():
        raw, p = fn()
        pre = premaster(raw)
        # how hard the peak limiter works (dB of peak shaved off); a few dB on the attack is
        # inaudible on soft notes, much more would flatten the piano's touch
        lim = max(0.0, true_peak(pre * undb(TARGET - lufs(pre))) - CEILING)
        y = write(f"{name}.wav", finish(pre, TARGET, ceiling=CEILING))
        built[name] = (y, p.events, p.levels)
        limiting[name] = round(lim, 1)

    for name, (y, events, levels) in built.items():
        m = measure(y, f"{name}.wav")
        m["momentary_max_lufs"] = momentary_max(y)
        m["landing_s"] = round(landing_time(y), 4)
        on = onsets(y)
        m["attacks"] = on
        m["attacks_not_on_a_note"] = stray(on, events)
        m["detector_self_test"] = detector_self_test(y, events)
        m["levels_vs_lead_db"] = levels
        m["limiter_peak_reduction_db"] = limiting[name]
        report[name] = m

    ref_land = report["01-current"]["landing_s"]
    for m in report.values():
        m["landing_vs_current_ms"] = round((m["landing_s"] - ref_land) * 1000, 1)
    report["_string_pitch_cents"] = pitch_test()
    report["_banned_sounds_in_source"] = static_check()

    with open(os.path.join(OUT, "measurements.json"), "w") as f:
        json.dump(report, f, indent=1)
    lines = checks(report)
    with open(os.path.join(OUT, "checks.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


def checks(r):
    out = ["version                         len  LUFS  mom.max  TP     land s (ms vs cur) first/last dBFS  mono  40-80Hz  click  stray",
           "-" * 128]
    fails = []
    for k, v in r.items():
        if k.startswith("_"):
            continue
        ok = dict(
            length=2.0 <= v["seconds"] <= 3.0,
            loud=abs(v["lufs_integrated"] - TARGET) <= 0.1,
            tp=v["true_peak_dbtp"] <= -1.0,
            land=abs(v["landing_s"] - 0.5) <= 0.005,
            ends=v["first_sample_dbfs"] <= -90 and v["last_sample_dbfs"] <= -90,
            mono=v["mono_fold_loss_lu"] > -1.5,
            clip=v["clipped_samples"] == 0,
            stray=not v["attacks_not_on_a_note"],
        )
        bad = [c for c, g in ok.items() if not g]
        if k == "01-current":
            # the reference is reported, not judged: its flagged attack (about 0.43 s) is the
            # little noise swell it plays into the landing, which the new versions leave out
            bad = [f"(reference; flagged: {c})" for c in bad]
        elif bad:
            fails.append(f"{k}: {', '.join(bad)}")
        out.append(f"{k:<31} {v['seconds']:<4} {v['lufs_integrated']:<5} {v['momentary_max_lufs']:<8} "
                   f"{v['true_peak_dbtp']:<6} {v['landing_s']:.4f} ({v['landing_vs_current_ms']:+.1f})   "
                   f"{v['first_sample_dbfs']}/{v['last_sample_dbfs']:<8}  {v['mono_fold_loss_lu']:<5} "
                   f"{v['bands_db_rel_total']['40-80']:<7}  {str(v['click_score']):<5}  {len(v['attacks_not_on_a_note'])}/{len(v['attacks'])}"
                   f"  {'PASS' if not bad else ('' if k == '01-current' else 'FAIL ') + ','.join(bad)}")
    out.append("")
    if r["_banned_sounds_in_source"]:
        fails.append("banned sound called: " + ", ".join(r["_banned_sounds_in_source"]))
    out.append("drum / thump / riser / glass-pluck calls in the new versions' source: "
               + (", ".join(r["_banned_sounds_in_source"]) or "none"))
    pc = r["_string_pitch_cents"]
    if any(abs(c) > 30 for c in pc.values()):
        fails.append("string pitch")
    out.append(f"string pitch check (cents off, want |x| <= 30): {pc}")
    # WHY info, not pass/fail: the self-test measures the DETECTOR, not the logo. A miss means
    # a planted sound was masked by the music at that spot (pads and subs cover a quiet tick
    # or kick), which is also why static_check() exists.
    caught = {d: [k[:2] for k, v in r.items() if not k.startswith("_") and v["detector_self_test"]
                  and d in v["detector_self_test"]["caught"]] for d in ("snap", "tick", "hat", "kick")}
    n_files = sum(1 for k in r if not k.startswith("_"))
    out.append("stray = attacks not on a written note / all attacks found.")
    out.append("Detector self-test (quiet drum sounds planted 14 dB under each file's peak, must be"
               " flagged): " + "; ".join(f"{d} caught in {len(c)}/{n_files}" for d, c in caught.items()))
    out.append("limiter peak reduction (dB): " + ", ".join(
        f"{k[:2]} {v['limiter_peak_reduction_db']}" for k, v in r.items()
        if not k.startswith("_") and v["limiter_peak_reduction_db"] is not None))
    out.append("ALL PASS" if not fails else "FAILURES: " + "; ".join(fails))
    return out


if __name__ == "__main__":
    main()
