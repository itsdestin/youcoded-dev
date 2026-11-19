#!/usr/bin/env python3
"""Lay UI sound cues over a rendered music bed and re-master.
  python mix.py --music out/hero60.wav --cues cues.json --out final.wav [--sfx-db -20]
cues.json: [{"t": 3.2, "type": "pop", "gain": -2}, {"t0": 1, "t1": 4, "type": "typing", "cps": 9}, ...]
types: key send bloom whoosh pop toggle typing. `gain` is an optional dB offset.
SFX peaks sit at (music peak + --sfx-db) = -20 dB by default, i.e. well under the music. Seeded: same input -> same bytes."""
import argparse, json, zlib
import numpy as np
import soundfile as sf
import dsp, sfx
from dsp import SR, db, pan

def expand(cues, seed):
    """-> list of (t, type, gain_db, pan). 'typing' becomes humanised key ticks."""
    rng = np.random.default_rng(seed)
    out = []
    for c in cues:
        if c['type'] == 'typing':
            t, t1, cps = c['t0'], c['t1'], float(c.get('cps', 9))
            step = 1.0 / cps
            while t < t1:
                # humanise: +-28% timing wobble, level wobble; occasional slightly longer pause
                out.append((t + rng.uniform(-0.28, 0.28) * step, 'key', c.get('gain', 0.0) + rng.uniform(-2.0, 0.5), rng.uniform(-0.1, 0.1)))
                t += step * (rng.uniform(1.6, 2.2) if rng.random() < 0.07 else 1.0)
        else:
            out.append((c['t'], c['type'], c.get('gain', 0.0), 0.0))
    return sorted(out, key=lambda e: e[0])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--music', required=True); ap.add_argument('--cues', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--sfx-db', type=float, default=-20.0, help='SFX peak level relative to the music peak (dB)')
    ap.add_argument('--seed', type=int, default=None)
    a = ap.parse_args()
    music, sr = sf.read(a.music, dtype='float64'); assert sr == SR
    n = len(music)
    cues = json.load(open(a.cues))
    seed = a.seed if a.seed is not None else zlib.crc32(json.dumps(cues, sort_keys=True).encode())
    rng = np.random.default_rng(seed)
    ref = np.abs(music).max() * db(a.sfx_db)
    fx = np.zeros((n, 2))
    for t, typ, g, p in expand(cues, seed):
        if typ not in sfx.KIT: raise SystemExit(f'unknown cue type {typ}')
        w = sfx.KIT[typ](rng) * ref * db(sfx.TRIM[typ] + g)
        i = int(round(t * SR))
        if i < 0 or i >= n: continue
        st = pan(w, p) * np.sqrt(2)
        j = min(n, i + len(st)); fx[i:j] += st[:j - i]
    # a touch of the same-style reverb on the UI sounds so they sit in the room rather than on top of it
    ir = dsp.make_ir(rt60=1.2, seed=3)
    wet = dsp.reverb(dsp.hp(fx, 300), ir, n) * 0.25
    x = music + fx + wet
    y = dsp.master(x)
    y = dsp.fit(y, n)
    sf.write(a.out, y, SR, subtype='PCM_24')
    print(f'{a.out}: {n/SR:.3f}s  LUFS {dsp.lufs(y):.2f}  TP {dsp.true_peak_db(y):.2f} dBTP  (sfx ref {20*np.log10(ref):.1f} dBFS, seed {seed})')

if __name__ == '__main__':
    main()
