#!/usr/bin/env python3
"""Shorten the long pauses in a narration and speed it up slightly, keeping the word times true.

    python3 tighten.py <name> [max_pause=0.5] [tempo=1.1]

WHY: the voice service reads at its own pace (about 83 s for the fairytale, whatever speed is asked for).
Trimming only the silences between words and a small tempo lift is how the read gets brisk without
sounding rushed. Reads ~/Videos/youcoded-campaign/voice/round2/<name>.mp3 + .words.json, writes
<name>-tight.wav + <name>-tight.words.json (times after both changes).
"""
import json, os, subprocess, sys, wave
import numpy as np
name = sys.argv[1]; cap = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5; tempo = float(sys.argv[3]) if len(sys.argv) > 3 else 1.1
D = os.path.expanduser("~/Videos/youcoded-campaign/voice/round2")
raw = f"{D}/.{name}.raw.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{D}/{name}.mp3", "-ac", "1", "-ar", "48000", raw], check=True)
w = wave.open(raw); sr = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32); w.close()
words = json.load(open(f"{D}/{name}.words.json"))
out, pos, shift, fade = [], 0, 0.0, int(0.012 * sr)
orig = [(x["start"], x["end"]) for x in words]   # the loop rewrites the times, so gaps are measured on the originals
for i, wd in enumerate(words):
    if i:
        gap = orig[i][0] - orig[i - 1][1]
        if gap > cap:
            # keep the first and last half of the allowed pause, drop the silence in the middle
            cut_a = orig[i - 1][1] + cap / 2; cut_b = orig[i][0] - cap / 2
            seg = a[pos:int(cut_a * sr)].copy(); seg[-fade:] *= np.linspace(1, 0, fade); out.append(seg)
            pos = int(cut_b * sr); a[pos:pos + fade] *= np.linspace(0, 1, fade)
            shift += cut_b - cut_a
    wd["start"] = (wd["start"] - shift) / tempo; wd["end"] = (wd["end"] - shift) / tempo
out.append(a[pos:])
cutf = f"{D}/.{name}.cut.wav"
o = wave.open(cutf, "w"); o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr); o.writeframes(np.concatenate(out).astype(np.int16).tobytes()); o.close()
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", cutf, "-af", f"atempo={tempo},highpass=f=70", f"{D}/{name}-tight.wav"], check=True)
os.remove(raw); os.remove(cutf)
json.dump(words, open(f"{D}/{name}-tight.words.json", "w"), indent=0)
print(f"{D}/{name}-tight.wav", round(words[-1]["end"], 1), "s")
