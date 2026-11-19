#!/usr/bin/env python3
"""Mix the "Yours." film's sound and put it under the rendered picture.

    python3 mix_yours.py [picture.mp4] [--sfx 0.8] [--music 1.0]

Three stems, all timed from film/src/yours.json:
  music  music/yours_60.wav (compose.py)        ducked under the voices
  sfx    music/sfx_yours.wav (music/sfx.py)     notifications, keys, Enter, blooms, whips
  voices voice/asks/<id>.wav (voice_kokoro.py)  each person, placed as they start typing
WHY mixed here, not in Remotion: ffmpeg ducks the music from the voices themselves, and one
picture render serves every sound revision.
Output: ~/Videos/youcoded-campaign/films/youcoded-yours-60s.mp4, -14 LUFS, true peak under -1.
"""
import argparse, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.expanduser("~/Videos/youcoded-campaign")
ap = argparse.ArgumentParser()
ap.add_argument("picture", nargs="?", default=os.path.join(HERE, "film/out/yours60-picture.mp4"))
ap.add_argument("--sfx", type=float, default=0.8)
ap.add_argument("--music", type=float, default=1.0)
ap.add_argument("--out", default=os.path.join(V, "films/youcoded-yours-60s.mp4"))
o = ap.parse_args()
Y = json.load(open(os.path.join(HERE, "film/src/yours.json")))
asks = Y["asks"]

args = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", o.picture,
        "-i", os.path.join(V, "music/yours_60.wav"), "-i", os.path.join(V, "music/sfx_yours.wav")]
for a in asks:
    args += ["-i", os.path.join(V, "voice/asks", f"{a['id']}.wav")]
parts = []
for i, a in enumerate(asks):
    ms = int(round((a["at"] + Y["ask_voice_at"]) * 1000))
    # Each voice: evened out, the boom and hiss trimmed, a touch of presence, and a small
    # room so it sounds like a person in a space rather than dry text-to-speech.
    parts.append(f"[{i + 3}:a]aresample=48000,aformat=channel_layouts=mono,highpass=f=90,lowpass=f=11000,"
                 "equalizer=f=3000:t=q:w=1:g=2,equalizer=f=250:t=q:w=1:g=-2,"
                 "loudnorm=I=-17:TP=-3:LRA=7,aresample=48000,"
                 "aecho=0.85:0.6:23|41|67:0.16|0.11|0.07,"
                 f"adelay={ms}:all=1[v{i}]")
vo_in = "".join(f"[v{i}]" for i in range(len(asks)))
graph = ";".join(parts) + (
    f";{vo_in}amix=inputs={len(asks)}:normalize=0:duration=longest,apad,atrim=0:60,"
    "pan=stereo|c0=c0|c1=c0,asplit=2[vo][key]"
    # Music dips while someone speaks and comes back in ~0.4 s.
    f";[1:a]aresample=48000,volume={o.music}[m];[key]apad[keyp];"
    "[m][keyp]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=380:makeup=1,atrim=0:60[md]"
    f";[2:a]aresample=48000,volume={o.sfx}[fx]"
    ";[md][fx][vo]amix=inputs=3:normalize=0:duration=first,atrim=0:60[pre]"
)
# Two-pass loudness: measure, then apply exact gain + a true-peak limiter.
# (the measuring pass needs ffmpeg's normal log level: the loudness summary is printed at "info")
probe = subprocess.run([x for x in args if x not in ("-loglevel", "error")] + ["-nostats", "-filter_complex", graph + ";[pre]ebur128=peak=true[o]", "-map", "[o]", "-f", "null", "-"],
                       capture_output=True, text=True)
summ = probe.stderr.split("Summary:")[-1]
if "I:" not in summ:
    sys.exit(probe.stderr[-2000:])
I0 = float(summ.split("I:")[1].split("LUFS")[0])
gain = -14.0 - I0
final = graph + f";[pre]volume={gain:.2f}dB,alimiter=limit=0.84:attack=3:release=50:level=0,aresample=48000[a]"
os.makedirs(os.path.dirname(o.out), exist_ok=True)
r = subprocess.run(args + ["-filter_complex", final, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "320k",
                           "-movflags", "+faststart", "-t", "60", o.out], capture_output=True, text=True)
if r.returncode:
    sys.exit(r.stderr)
m = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", o.out, "-af", "ebur128=peak=true", "-f", "null", "-"],
                   capture_output=True, text=True).stderr.split("Summary:")[-1]
print(f"{o.out}  {m.split('I:')[1].split('LUFS')[0].strip()} LUFS  TP {m.split('Peak:')[1].split('dBFS')[0].strip()}")
