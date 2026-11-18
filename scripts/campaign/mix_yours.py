#!/usr/bin/env python3
"""Mix the "Yours." film's sound: music + one narrator, and put it under the rendered picture.

    python3 mix_yours.py <engine>/<voice> [picture.mp4]

WHY mix here instead of inside Remotion: one picture render serves every voice we try, and
ffmpeg can duck the music from the voice itself (sidechain), which follows the real words
rather than guessed windows. Line times come from film/src/yours.json.
Output: ~/Videos/youcoded-campaign/films/youcoded-yours-60s-<engine>-<voice>.mp4 at -14 LUFS.
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.expanduser("~/Videos/youcoded-campaign")
who = sys.argv[1]
pic = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "film/out/yours60-picture.mp4")
Y = json.load(open(os.path.join(HERE, "film/src/yours.json")))
lines = Y["vo"]
vdir = os.path.join(V, "voice", who)
out = os.path.join(V, "films", f"youcoded-yours-60s-{who.replace('/', '-')}.mp4")

args = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", pic, "-i", os.path.join(V, "music/yours_60.wav")]
for ln in lines:
    args += ["-i", os.path.join(vdir, f"{ln['id']}.wav")]
parts = []
for i, ln in enumerate(lines):
    ms = int(round(ln["t"] * 1000))
    # Each line evened out on its own first, so no line is quieter than the rest.
    parts.append(f"[{i + 2}:a]aresample=48000,aformat=channel_layouts=mono,highpass=f=70,"
                 f"loudnorm=I=-17:TP=-3:LRA=7,aresample=48000,adelay={ms}:all=1,apad=whole_dur=60[v{i}]")
vo_in = "".join(f"[v{i}]" for i in range(len(lines)))
graph = ";".join(parts) + (
    f";{vo_in}amix=inputs={len(lines)}:normalize=0:duration=longest,atrim=0:60,"
    "acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=2dB,pan=stereo|c0=c0|c1=c0,asplit=2[vo][key]"
    # Music dips about 8 dB while the narrator speaks and comes back in ~0.4 s.
    ";[1:a]aresample=48000[m];[key]apad[keyp];[m][keyp]sidechaincompress=threshold=0.02:ratio=5:attack=25:release=420:makeup=1,atrim=0:60[md]"
    ";[vo]apad[vop];[md][vop]amix=inputs=2:normalize=0:duration=first,atrim=0:60,"
    "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]"
)
args += ["-filter_complex", graph, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "320k",
         "-movflags", "+faststart", "-t", "60", out]
os.makedirs(os.path.dirname(out), exist_ok=True)
r = subprocess.run(args, capture_output=True, text=True)
if r.returncode:
    sys.exit(r.stderr)
m = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", out, "-af", "ebur128=peak=true", "-f", "null", "-"],
                   capture_output=True, text=True).stderr.split("Summary:")[-1]
I = m.split("I:")[1].split("LUFS")[0].strip()
tp = m.split("Peak:")[1].split("dBFS")[0].strip()
print(f"{out}  {I} LUFS  TP {tp}")
