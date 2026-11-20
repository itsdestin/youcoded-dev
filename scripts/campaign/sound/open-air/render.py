"""Render every Open air deliverable into out/, then measure it.

    .venv/bin/python render.py          (from this folder; or ./build.sh)
"""
import json
import os
import sys
import time

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import score  # noqa: E402
from dsp import SR  # noqa: E402

OUT = os.path.join(HERE, 'out')


def write(name, x):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sf.write(path, np.asarray(x, dtype=np.float32), SR, subtype='PCM_24')
    print(f'  wrote {name}  ({len(x) / SR:.2f} s)')


def main():
    t0 = time.time()
    meta = {}
    write('logo.wav', score.logo_master())
    x, m = score.motif_piece()
    write('motif.wav', x)
    meta['motif'] = {k: v for k, v in m.items() if k != 'logo'}
    for name, fn in (('demo-hopeful', score.hopeful), ('demo-playful', score.playful), ('demo-stark', score.stark)):
        x, m = fn()
        write(f'{name}.wav', x)
        meta[name] = {k: v for k, v in m.items() if k != 'logo'}
    write('sfx/type-tick.wav', score.finish_sfx(score.sfx_tick()))
    write('sfx/change.wav', score.finish_sfx(score.sfx_change()))
    write('sfx/arrive.wav', score.finish_sfx(score.sfx_arrive()))
    write('sfx/strike.wav', score.finish_sfx(score.sfx_strike()))
    meta['MOTIF'] = score.MOTIF
    with open(os.path.join(OUT, 'timing.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print(f'rendered in {time.time() - t0:.0f} s')


if __name__ == '__main__':
    main()
