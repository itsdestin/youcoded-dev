#!/usr/bin/env python3
"""Free, on-device voices with Kokoro (open model, Apache-2.0) for the people asking in "Yours.".

    ~/.cache/youcoded-campaign/tts/.venv/bin/python voice_kokoro.py [speed]

Reads film/src/yours.json "asks" (each has its own voice); writes
~/Videos/youcoded-campaign/voice/asks/<id>.wav and records each take's length back into
yours.json ("say_len") so the film can time the typing to the speech.
"""
import json, os, sys
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.expanduser("~/.cache/youcoded-campaign/tts")
speed = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
k = Kokoro(os.path.join(M, "kokoro-v1.0.onnx"), os.path.join(M, "voices-v1.0.bin"))
out = os.path.expanduser("~/Videos/youcoded-campaign/voice/asks")
os.makedirs(out, exist_ok=True)
p = os.path.join(HERE, "film/src/yours.json")
Y = json.load(open(p))
for a in Y["asks"]:
    audio, sr = k.create(a["say"], voice=a["voice"], speed=speed, lang="en-us")
    # Trim the model's leading/trailing silence so "say_len" is the speech itself.
    idx = np.where(np.abs(audio) > 0.01)[0]
    audio = audio[max(0, idx[0] - int(0.02 * sr)): idx[-1] + int(0.08 * sr)]
    sf.write(os.path.join(out, f"{a['id']}.wav"), audio, sr)
    a["say_len"] = round(len(audio) / sr, 3)
    print(a["id"], a["voice"], a["say_len"], "s")
json.dump(Y, open(p, "w"), indent=1)
