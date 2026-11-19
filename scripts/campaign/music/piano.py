"""Piano voice: GeneralUser GS acoustic grand rendered note-by-note with fluidsynth (no fluidsynth reverb/chorus),
cached on disk. Each cached note is trimmed so its first audible sample is sample 0, so placing it at time t
puts the attack on t."""
import os, struct, subprocess, tempfile, hashlib
import numpy as np
import soundfile as sf
from dsp import SR

HERE = os.path.dirname(os.path.abspath(__file__))
SF2 = os.path.join(HERE, 'assets', 'GeneralUser-GS.sf2')
CACHE = os.path.join(HERE, 'assets', 'cache')
PROGRAM = 0          # GM Acoustic Grand
TAIL = 2.5           # seconds of release captured after note-off


def _vlq(n):
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))


def _midi(notes):
    """notes: list of (start_ms, dur_ms, midi, vel). 1 tick = 1 ms."""
    ev = []
    for s, d, m, v in notes:
        ev.append((s, 1, m, v))
        ev.append((s + d, 0, m, 0))
    ev.sort(key=lambda e: (e[0], e[1]))
    trk = bytearray()
    trk += b'\x00\xC0' + bytes([PROGRAM])
    last = 0
    for t, on, m, v in ev:
        trk += _vlq(t - last)
        trk += bytes([0x90 if on else 0x80, m, v])
        last = t
    trk += b'\x00\xFF\x2F\x00'
    hdr = b'MThd' + struct.pack('>IHHH', 6, 0, 1, 500)  # 500 ticks/quarter, tempo 500000us -> 1 tick = 1 ms
    tempo = b'\x00\xFF\x51\x03' + (500000).to_bytes(3, 'big')
    body = tempo + bytes(trk)
    return hdr + b'MTrk' + struct.pack('>I', len(body)) + body


def _key(m, v, d):
    return f"{m}_{v}_{int(round(d * 1000))}"


def render(requests):
    """requests: iterable of (midi, vel, dur_seconds). Returns dict key->(n,2) array, first sample = onset."""
    os.makedirs(CACHE, exist_ok=True)
    out, missing = {}, []
    for m, v, d in sorted(set(requests)):
        p = os.path.join(CACHE, _key(m, v, d) + '.npy')
        if os.path.exists(p):
            out[(m, v, d)] = np.load(p)
        else:
            missing.append((m, v, d))
    if missing:
        slots, t, notes = [], 500, []
        for m, v, d in missing:
            notes.append((t, int(d * 1000), m, v))
            slots.append((t, int(d * 1000) + int(TAIL * 1000)))
            t += int(d * 1000) + int(TAIL * 1000) + 300
        with tempfile.TemporaryDirectory() as td:
            mid, wav = os.path.join(td, 'n.mid'), os.path.join(td, 'n.wav')
            open(mid, 'wb').write(_midi(notes))
            subprocess.run(['fluidsynth', '-ni', '-q', '-r', str(SR), '-g', '0.7', '-R', '0', '-C', '0',
                            '-F', wav, SF2, mid], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            audio, sr = sf.read(wav, dtype='float64')
        assert sr == SR
        for (m, v, d), (st, ln) in zip(missing, slots):
            seg = audio[int(st / 1000 * SR): int((st + ln) / 1000 * SR)].copy()
            # Place the PERCEPTUAL onset at sample 0: low-velocity soundfont notes have a soft ~5-10 ms
            # attack ramp, so trimming at the first nonzero sample would make them land late. Find where the
            # 1 ms-smoothed envelope first reaches 12% of its peak in the first 80 ms and keep 1 ms of pre-roll.
            mono = np.max(np.abs(seg), axis=1)
            env = np.convolve(mono, np.ones(48) / 48, mode='same')
            head = env[: int(0.08 * SR)]
            on = max(0, int(np.argmax(head > 0.12 * head.max())) - int(0.001 * SR))
            seg = seg[on:]
            # fade the very end so the cached tail never clicks
            nf = int(0.2 * SR)
            seg[-nf:] *= np.linspace(1, 0, nf)[:, None]
            np.save(os.path.join(CACHE, _key(m, v, d) + '.npy'), seg)
            out[(m, v, d)] = seg
    return out
