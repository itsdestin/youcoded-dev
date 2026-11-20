"""The brand's piano voice (round five): the Salamander Grand Piano V3, a Yamaha C5 recorded with 16 velocity
layers by Alexander Holm, in FreePats' SF2 edition. Licence: Creative Commons Attribution 3.0, which allows
commercial use (ads included) with a credit line: "Piano: Salamander Grand Piano by Alexander Holm (CC BY 3.0)".
WHY (round five review): the signature instrument was the free General MIDI grand from GeneralUser GS, doctored
with added harmonics and played harder than written to fake brightness. On good speakers that is the clearest
tell of cheap production. A multi-sampled concert grand has a real hammer, real overtones and real soft-to-loud
tone change, so all of those tricks are dropped (bs_engine.render_piano).
Rendering reuses piano.py's note-by-note fluidsynth renderer and on-disk cache, pointed at this sound bank and its
own cache folder. The sound bank (1.2 GB) is downloaded once by `python bs_piano.py fetch` (assets/ is not in git).
Usage: imported by bs_engine; `python bs_piano.py` renders a test scale to out/piano-test.wav."""
import os
import piano as pianomod

HERE = os.path.dirname(os.path.abspath(__file__))
SF2 = os.path.join(HERE, 'assets', 'salamander', 'SalamanderGrandPiano-SF2-V3+20200602', 'SalamanderGrandPiano-V3+20200602.sf2')
CACHE = os.path.join(HERE, 'assets', 'cache-salamander')
CREDIT = 'Piano: Salamander Grand Piano by Alexander Holm (CC BY 3.0)'
URL = 'https://freepats.zenvoid.org/Piano/SalamanderGrandPiano/SalamanderGrandPiano-SF2-V3+20200602.tar.xz'
SHA256 = '712d0e681efbe5203a8014e9b3e84168f1908c82f2f6fb13bd2c77d6d72c70b7'   # of the .sf2 inside


def fetch():
    """Download and unpack the sound bank into assets/salamander/, then check it is the exact file the scores were
    balanced with. WHY a checksum: a different edition would change every level in every film without warning.
    The file is only ever read by fluidsynth as data; nothing in it is run."""
    import hashlib, tarfile, tempfile, urllib.request
    os.makedirs(os.path.dirname(os.path.dirname(SF2)), exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        tgz = os.path.join(td, 'sal.tar.xz')
        urllib.request.urlretrieve(URL, tgz)
        with tarfile.open(tgz) as tf:
            tf.extractall(os.path.dirname(os.path.dirname(SF2)), filter='data')
    h = hashlib.sha256()
    with open(SF2, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    print('sha256', 'OK' if h.hexdigest() == SHA256 else 'DIFFERS: levels were tuned on another edition')


def available():
    return os.path.exists(SF2)


def render(requests):
    """Same contract as piano.render: {(midi, vel, dur): (n, 2) array whose first sample is the attack}.
    WHY swap the module's two paths for the call and put them back: piano.py stays exactly as round one left it
    (the round-one scores still render with it), and nothing else needs to know two pianos exist."""
    if not available():
        raise SystemExit('The brand piano (Salamander Grand Piano) is not downloaded. Run: .venv/bin/python bs_piano.py fetch')
    old = pianomod.SF2, pianomod.CACHE
    pianomod.SF2, pianomod.CACHE = SF2, CACHE
    try:
        return pianomod.render(requests)
    finally:
        pianomod.SF2, pianomod.CACHE = old


if __name__ == '__main__':
    import sys
    if sys.argv[1:2] == ['fetch']:
        fetch()
        sys.exit()
    import numpy as np, soundfile as sf
    from dsp import SR
    reqs = [(m, v, 0.6) for m in (48, 60, 72, 84) for v in (30, 60, 90, 120)]
    r = render(reqs)
    out = np.concatenate([np.pad(r[k], ((0, max(0, int(1.2 * SR) - len(r[k]))), (0, 0)))[:int(1.2 * SR)] for k in reqs])
    sf.write(os.path.join(HERE, 'out', 'piano-test.wav'), out, SR)
    for k in reqs:
        y = r[k]
        print(k, f'peak {20 * np.log10(np.abs(y).max() + 1e-12):.1f} dB')
