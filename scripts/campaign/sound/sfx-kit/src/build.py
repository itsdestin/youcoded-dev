"""Render the whole youcoded sound-effects kit into out/, level it, measure it, and write
out/checks.txt (plain pass/fail lines) and out/measurements.json (raw numbers)."""
import json
import sys
import numpy as np
import soundfile as sf
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dsp
import measure
import sounds as S

OUT = Path(__file__).resolve().parent.parent / "out"
VARS = ("a", "b", "c")

# name -> function(variant) returning mono
KIT = {
    "key-press": S.key_press,
    "send": S.send,
    "reply-arrives": S.reply,
    "appear": S.appear,
    "change": S.change,
    "move": S.move,
    "grow": S.grow,
    "marker-stroke": lambda v: S.marker(v, 0.6),
    "handwriting": S.handwriting,
    "page-turn": S.page_turn,
    "lock": S.lock,
    "unlock": S.unlock,
    "count-up": S.count_up,
    "reveal": S.reveal,
}
# extra files that share a trio's gain: (file name, trio, function(variant))
EXTRAS = [
    ("typing-demo", "key-press", S.typing_demo),
    ("marker-stroke-short", "marker-stroke", lambda v: S.marker(v, 0.25)),
]

PEAK_TARGET = -6.0      # dBFS: each trio's loudest peak
KEY_OFFSET = -12.0      # the key press sits 12 dB under everything else
NO_SWEEP = ("change", "move", "reveal")
LOUD_CEILING = -18.0    # LUFS (loudest 100 ms): no effect may feel louder than this
CLACK_LIMIT = -18.0     # dB: no sudden 2-6 kHz onset louder than this relative to the peak


def finish(mono, settle=False):
    """Shared last steps: round any hard treble attack, (for change/move/reveal) keep the
    brightness from rising, remove sub-rumble, close room + mono-safe stereo, clean edges."""
    y = dsp.hp(mono, 40)
    if settle:
        # WHY three passes: each one stops the energy above its split point from growing
        # relative to everything below it, so together the overall brightness cannot rise.
        for f in (200.0, 400.0, 1000.0, 2500.0):
            y = dsp.settle_brightness(y, f)
    y = dsp.round_attacks(y)
    # no dead air: every file starts at the touch and stops when the sound has died away
    y = dsp.trim(y, -72, pre_ms=1, post_ms=15)
    y = dsp.fade(y, 0.8, 12)
    st = dsp.to_stereo(y)
    for c in range(2):
        st[:, c] = dsp.fade(st[:, c], 0.8, 12)
    return st / (np.abs(st).max() + 1e-20)


def main():
    OUT.mkdir(exist_ok=True)
    rendered, gains = {}, {}
    for name, fn in KIT.items():
        trio = {v: finish(fn(v), settle=name in NO_SWEEP) for v in VARS}
        loud = {v: measure.short_loudness(x) for v, x in trio.items()}
        ref = float(np.mean(list(loud.values())))
        # match perceived loudness within the trio ...
        g = {v: 10 ** ((ref - loud[v]) / 20) for v in VARS}
        # ... then set the trio so its loudest peak sits at the target
        top = max(20 * np.log10(np.abs(trio[v] * g[v]).max()) for v in VARS)
        target = PEAK_TARGET + (KEY_OFFSET if name == "key-press" else 0.0)
        shift = target - top
        # WHY a loudness ceiling too: steady sounds (a marker line, a page, a fabric settle)
        # peaking at -6 dB would feel far louder than a tap peaking at -6 dB. No trio may
        # feel louder than LOUD_CEILING, so the whole kit sits together.
        if name != "key-press":
            ceiling = LOUD_CEILING + (2.0 if name == "reveal" else 0.0)  # the biggest moment
            shift = min(shift, ceiling - ref)
        for v in VARS:
            g[v] *= 10 ** (shift / 20)
            rendered[f"{name}-{v}"] = (name, trio[v] * g[v])
        gains[name] = g
    for fname, trio_name, fn in EXTRAS:
        for v in VARS:
            st = finish(fn(v)) * gains[trio_name][v]
            if fname == "typing-demo":  # keep the demo exactly 3 s (silence after the last key)
                st = np.concatenate([st, np.zeros((max(0, dsp.secs(3.0) - len(st)), 2))])[: dsp.secs(3.0)]
            rendered[f"{fname}-{v}"] = (trio_name, st)

    report, lines = {}, []
    ok_all = True
    for key, (trio_name, st) in rendered.items():
        sf.write(OUT / f"{key}.wav", st.astype(np.float32), dsp.SR, subtype="PCM_24")
        r = measure.report(st)
        report[key] = r
        checks = [
            ("clean start/end (first and last sample below -90 dBFS)", r["first_db"] < -90 and r["last_db"] < -90),
            (f"no clack (sudden 2-6 kHz onsets at or under {CLACK_LIMIT:.0f} dB re peak; got {r['clack_db']:.1f})", r["clack_db"] <= CLACK_LIMIT),
            (f"mono-safe (loses {r['mono_loss_lu']:.2f} LU in mono, under 0.5)", r["mono_loss_lu"] < 0.5),
            (f"no clipping (true peak {r['true_peak_db']:.1f} dBTP)", r["true_peak_db"] < -1.0),
        ]
        if trio_name in NO_SWEEP:
            s = r["sweep"]
            checks.append((
                f"no upward sweep (brightness {s['start']:.0f} -> {s['end']:.0f} Hz, net {s['net_oct']:+.2f} oct, "
                f"largest upward move {s['max_rise_oct']:.2f} oct; limits: net <= +0.15, move <= 0.35)",
                s["net_oct"] <= 0.15 and s["max_rise_oct"] <= 0.35,
            ))
        for desc, ok in checks:
            ok_all &= ok
            lines.append(f"{'PASS' if ok else 'FAIL'}  {key:26s} {desc}")
    # loudness match within each trio
    for name in KIT:
        ls = [report[f"{name}-{v}"]["loud"] for v in VARS]
        spread = max(ls) - min(ls)
        ok = spread < 0.5
        ok_all &= ok
        lines.append(f"{'PASS' if ok else 'FAIL'}  {name:26s} trio loudness matched (spread {spread:.2f} LU; "
                     + ", ".join(f"{v} {l:.1f}" for v, l in zip(VARS, ls)) + ")")
    lines.append("")
    lines.append("file                       dur(s)  peak(dBFS)  loudest-100ms(LUFS)  clack(dB)  mono-loss(LU)")
    for key, r in report.items():
        lines.append(f"{key:26s} {r['dur']:6.2f}  {r['peak_db']:9.1f}  {r['loud']:18.1f}  {r['clack_db']:9.1f}  {r['mono_loss_lu']:12.2f}")
    (OUT / "checks.txt").write_text("\n".join(lines) + "\n")
    (OUT / "measurements.json").write_text(json.dumps(report, indent=1))
    print("\n".join(l for l in lines if l.startswith("FAIL")) or "all checks pass")
    print(f"{len(rendered)} files in {OUT}")
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
