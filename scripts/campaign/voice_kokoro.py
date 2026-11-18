#!/usr/bin/env python3
"""Free, on-device narration with Kokoro (open model, Apache-2.0), for comparing against a paid voice.

    ~/.cache/youcoded-campaign/tts/.venv/bin/python voice_kokoro.py <voice> [speed]

Reads the lines from film/src/yours.json; writes ~/Videos/youcoded-campaign/voice/kokoro/<voice>/<id>.wav.
"""
import json, os, sys
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.expanduser("~/.cache/youcoded-campaign/tts")
voice = sys.argv[1]
speed = float(sys.argv[2]) if len(sys.argv) > 2 else 0.92
k = Kokoro(os.path.join(M, "kokoro-v1.0.onnx"), os.path.join(M, "voices-v1.0.bin"))
out = os.path.expanduser(f"~/Videos/youcoded-campaign/voice/kokoro/{voice}")
os.makedirs(out, exist_ok=True)
for line in json.load(open(os.path.join(HERE, "film/src/yours.json")))["vo"]:
    # WHY respell: "youcoded" as one word reads as "yoo-coded" or worse; say it as two.
    text = line["text"].replace("youcoded", "you coded")
    a, sr = k.create(text, voice=voice, speed=speed, lang="en-us")
    sf.write(os.path.join(out, f"{line['id']}.wav"), a, sr)
    print(line["id"], round(len(a) / sr, 2), "s")
